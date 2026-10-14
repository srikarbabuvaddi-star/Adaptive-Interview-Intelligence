const JobProviderInterface = require('./jobProvider.interface');
const env = require('../../../config/env');
const ApiError = require('../../../utils/apiError');
const logger = require('../../../utils/logger');

class JSearchAdapter extends JobProviderInterface {
  constructor(config = {}) {
    super();
    this.apiKey = config.apiKey || env.JSEARCH_API_KEY;
    this.apiHost = config.apiHost || env.JSEARCH_API_HOST || 'jsearch.p.rapidapi.com';
    this.baseUrl = 'https://jsearch.p.rapidapi.com';
    this.timeoutMs = config.timeoutMs || 8000;
  }

  getProviderName() {
    return 'jsearch';
  }

  _isConfigured() {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  /**
   * Internal HTTP request helper with timeout and standardized error handling
   */
  async _fetch(endpoint, params = {}) {
    if (!this._isConfigured()) {
      throw ApiError.serviceUnavailable(
        'JSearch API key is not configured. Please set JSEARCH_API_KEY in your server environment variables.'
      );
    }

    const url = new URL(endpoint, this.baseUrl);
    Object.entries(params).forEach(([key, val]) => {
      if (val !== undefined && val !== null && val !== '') {
        url.searchParams.append(key, String(val));
      }
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'x-rapidapi-host': this.apiHost,
          'x-rapidapi-key': this.apiKey,
          Accept: 'application/json'
        },
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw ApiError.unauthorized('Invalid or unauthorized JSearch API credentials. Please verify your RapidAPI key.');
        }
        if (response.status === 429) {
          throw ApiError.tooManyRequests('JSearch API rate limit or monthly quota exceeded.');
        }
        const errText = await response.text().catch(() => '');
        throw ApiError.serviceUnavailable(`JSearch API error (${response.status}): ${errText || response.statusText}`);
      }

      return await response.json();
    } catch (err) {
      clearTimeout(timeout);
      if (err.name === 'AbortError') {
        throw ApiError.serviceUnavailable('JSearch API request timed out after 8 seconds.');
      }
      if (err instanceof ApiError) {
        throw err;
      }
      logger.error(`JSearch adapter network error: ${err.message}`);
      throw ApiError.serviceUnavailable(`Could not connect to JSearch API: ${err.message}`);
    }
  }

  /**
   * Searches live job vacancies via JSearch /search
   */
  async searchJobs({
    query = 'Software Engineer',
    location = '',
    country = 'in',
    remote = 'all',
    experienceLevel = 'all',
    employmentType = 'all',
    salaryMin,
    page = 1,
    limit = 10
  }) {
    // Construct rich query string: e.g. "React Developer in Bengaluru, India"
    const queryParts = [query.trim()];
    if (location && location.trim()) {
      queryParts.push(`in ${location.trim()}`);
    }
    if (country && country.trim()) {
      const countryNames = {
        in: 'India',
        us: 'USA',
        gb: 'United Kingdom',
        ca: 'Canada',
        de: 'Germany',
        au: 'Australia'
      };
      const countryName = countryNames[country.toLowerCase()] || country.toUpperCase();
      queryParts.push(countryName);
    }
    const fullQuery = queryParts.join(' ');

    const requestParams = {
      query: fullQuery,
      page: Number(page) || 1,
      num_pages: 1
    };

    // Work arrangement filter
    if (remote === true || remote === 'true') {
      requestParams.work_from_home = 'true';
    }

    // Employment type mapping
    if (employmentType && employmentType !== 'all') {
      const typeMap = {
        fulltime: 'FULLTIME',
        contractor: 'CONTRACTOR',
        contract: 'CONTRACTOR',
        parttime: 'PARTTIME',
        intern: 'INTERN',
        internship: 'INTERN'
      };
      if (typeMap[employmentType.toLowerCase()]) {
        requestParams.employment_types = typeMap[employmentType.toLowerCase()];
      }
    }

    // Experience requirements mapping
    if (experienceLevel && experienceLevel !== 'all') {
      const expLower = experienceLevel.toLowerCase();
      if (expLower === 'entry' || expLower === 'junior') {
        requestParams.job_requirements = 'under_3_years_experience';
      } else if (expLower === 'senior' || expLower === 'lead') {
        requestParams.job_requirements = 'more_than_3_years_experience';
      }
    }

    const data = await this._fetch('/search', requestParams);
    const rawJobs = Array.isArray(data.data) ? data.data : [];

    const normalizedJobs = rawJobs.map(raw => this.normalizeJob(raw, country));

    // Optional client-side salaryMin filtering if raw API did not filter
    let filteredJobs = normalizedJobs;
    if (salaryMin && Number(salaryMin) > 0) {
      const minThreshold = Number(salaryMin);
      filteredJobs = filteredJobs.filter(j => {
        if (!j.salary.hasSalary) return true; // keep undisclosed so candidate sees them
        const annualMax = j.salary.normalizedAnnual?.max || j.salary.normalizedAnnual?.min || 0;
        return annualMax >= minThreshold;
      });
    }

    const total = data.total_results || filteredJobs.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));

    return {
      jobs: filteredJobs.slice(0, limit),
      total,
      page: Number(page),
      totalPages,
      provider: this.getProviderName()
    };
  }

  /**
   * Retrieves full details for a single job
   */
  async getJobDetails(jobId) {
    const data = await this._fetch('/job-details', {
      job_id: jobId,
      extended_publisher_details: 'false'
    });

    const rawList = Array.isArray(data.data) ? data.data : [];
    if (rawList.length === 0) {
      throw ApiError.notFound(`Job listing with ID ${jobId} was not found on JSearch.`);
    }

    return this.normalizeJob(rawList[0]);
  }

  /**
   * Retrieves estimated market salary from JSearch /estimated-salary
   */
  async getSalaryEstimate({ jobTitle, location = '', country = 'in' }) {
    try {
      const locationQuery = location ? `${location}, ${country.toUpperCase()}` : country.toUpperCase();
      const data = await this._fetch('/estimated-salary', {
        job_title: jobTitle,
        location: locationQuery,
        radius: 100
      });

      const estimates = Array.isArray(data.data) ? data.data : [];
      if (estimates.length === 0) {
        return {
          hasEstimate: false,
          source: 'JSearch Market Index',
          message: 'Market estimate unavailable'
        };
      }

      const primary = estimates[0];
      const currency = primary.salary_currency || (country.toLowerCase() === 'in' ? 'INR' : 'USD');
      const min = primary.min_salary || null;
      const max = primary.max_salary || null;
      const median = primary.median_salary || (min && max ? Math.round((min + max) / 2) : min || max);

      return {
        hasEstimate: true,
        type: 'provider_estimated',
        min,
        max,
        median,
        currency,
        period: primary.salary_period ? primary.salary_period.toLowerCase() : 'year',
        source: `Estimated Market Pay (${primary.publisher_name || 'Glassdoor'})`,
        location: locationQuery,
        confidence: primary.confidence_level || 'standard'
      };
    } catch (err) {
      logger.warn(`JSearch estimated-salary lookup failed: ${err.message}`);
      return {
        hasEstimate: false,
        source: 'JSearch Market Index',
        message: 'Market estimate unavailable'
      };
    }
  }

  /**
   * Normalizes a JSearch raw job item into internal NormalizedJob format
   */
  normalizeJob(raw, defaultCountry = 'in') {
    const countryCode = (raw.job_country || defaultCountry || 'in').toLowerCase();
    const isIndian = countryCode === 'in';
    const defaultCurrency = isIndian ? 'INR' : 'USD';

    // 1. Posting date / freshness
    let postedAt = null;
    let postedAtDisplay = 'Posting date unavailable';

    if (raw.job_posted_at_datetime_utc) {
      try {
        const d = new Date(raw.job_posted_at_datetime_utc);
        if (!isNaN(d.getTime())) {
          postedAt = d.toISOString();
          postedAtDisplay = this._formatRelativeTime(d);
        }
      } catch (_) {}
    } else if (raw.job_posted_at_timestamp) {
      try {
        const d = new Date(raw.job_posted_at_timestamp * 1000);
        if (!isNaN(d.getTime())) {
          postedAt = d.toISOString();
          postedAtDisplay = this._formatRelativeTime(d);
        }
      } catch (_) {}
    }

    // 2. Salary handling (Advertised vs Undisclosed)
    const hasAdvertisedSalary = raw.job_min_salary != null || raw.job_max_salary != null;
    const currency = raw.job_salary_currency || defaultCurrency;
    const period = (raw.job_salary_period || 'year').toLowerCase();
    const minSalary = raw.job_min_salary != null ? Number(raw.job_min_salary) : null;
    const maxSalary = raw.job_max_salary != null ? Number(raw.job_max_salary) : null;

    let displaySalary = 'Salary not disclosed';
    let normalizedAnnual = null;

    if (hasAdvertisedSalary) {
      const minAnnual = this._toAnnual(minSalary, period);
      const maxAnnual = this._toAnnual(maxSalary, period);
      normalizedAnnual = {
        min: minAnnual,
        max: maxAnnual,
        currency
      };

      displaySalary = this._formatSalaryDisplay(minSalary, maxSalary, currency, period);
    }

    // 3. Required skills & qualifications extraction
    const rawSkills = Array.isArray(raw.job_required_skills) ? raw.job_required_skills : [];
    const qualifications = raw.job_highlights?.Qualifications || [];
    const responsibilities = raw.job_highlights?.Responsibilities || [];

    const extractedSkills = this._extractSkills({
      rawSkills,
      qualifications,
      title: raw.job_title || '',
      description: raw.job_description || ''
    });

    // 4. Experience parsing
    const expMonths = raw.job_required_experience?.required_experience_in_months || null;
    let experienceLevel = 'Not specified';
    if (expMonths !== null) {
      if (expMonths <= 24) experienceLevel = 'Entry (0-2 yrs)';
      else if (expMonths <= 60) experienceLevel = 'Mid (2-5 yrs)';
      else experienceLevel = 'Senior (5+ yrs)';
    } else if (raw.job_required_experience?.no_experience_required) {
      experienceLevel = 'Entry (No experience)';
    }

    // 5. Workplace type
    const isRemote = Boolean(raw.job_is_remote);
    const workplaceType = isRemote ? 'remote' : 'on-site';

    // 6. Location formatting
    const locationParts = [raw.job_city, raw.job_state, raw.job_country].filter(Boolean);
    const displayLocation = locationParts.length > 0 ? locationParts.join(', ') : isRemote ? 'Remote' : 'Location unspecified';

    return {
      id: String(raw.job_id || `${raw.employer_name}_${raw.job_title}_${Date.now()}`),
      provider: 'jsearch',
      title: raw.job_title || 'Untitled Role',
      employer: {
        name: raw.employer_name || 'Hiring Company',
        logo: raw.employer_logo || null,
        website: raw.employer_website || null
      },
      location: {
        city: raw.job_city || null,
        state: raw.job_state || null,
        country: countryCode.toUpperCase(),
        displayLocation,
        isRemote,
        workplaceType
      },
      employmentType: (raw.job_employment_type || 'full-time').toLowerCase().replace('_', '-'),
      experienceLevel,
      experienceRequirementMonths: expMonths,
      description: raw.job_description || 'Detailed job description not provided by board.',
      requiredSkills: extractedSkills,
      qualifications,
      responsibilities,
      postedAt,
      postedAtDisplay,
      salary: {
        hasSalary: hasAdvertisedSalary,
        type: hasAdvertisedSalary ? 'advertised' : 'undisclosed',
        min: minSalary,
        max: maxSalary,
        currency,
        period,
        isPredicted: false,
        displaySalary,
        normalizedAnnual,
        source: hasAdvertisedSalary ? 'Employer Advertised' : null
      },
      source: raw.job_publisher ? `${raw.job_publisher} via JSearch` : 'Direct Employer Posting via JSearch',
      applyUrl: raw.job_apply_link || '#',
      isExpired: false
    };
  }

  _toAnnual(amount, period) {
    if (amount == null) return null;
    const num = Number(amount);
    if (isNaN(num)) return null;
    if (period === 'hour') return Math.round(num * 2080);
    if (period === 'month') return Math.round(num * 12);
    if (period === 'week') return Math.round(num * 52);
    return Math.round(num);
  }

  _formatSalaryDisplay(min, max, currency, period) {
    const symbolMap = {
      INR: '₹',
      USD: '$',
      GBP: '£',
      EUR: '€',
      CAD: 'CA$',
      AUD: 'A$'
    };
    const sym = symbolMap[currency?.toUpperCase()] || `${currency} `;

    const formatNum = (n) => {
      if (currency?.toUpperCase() === 'INR') {
        return Number(n).toLocaleString('en-IN');
      }
      return Number(n).toLocaleString('en-US');
    };

    const periodSuffix = period ? ` / ${period}` : '';

    if (min != null && max != null && min !== max) {
      return `${sym}${formatNum(min)} - ${sym}${formatNum(max)}${periodSuffix}`;
    }
    if (min != null) {
      return `From ${sym}${formatNum(min)}${periodSuffix}`;
    }
    if (max != null) {
      return `Up to ${sym}${formatNum(max)}${periodSuffix}`;
    }
    return 'Salary not disclosed';
  }

  _formatRelativeTime(date) {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) > 1 ? 's' : ''} ago`;
    return `${Math.floor(diffDays / 30)} month${Math.floor(diffDays / 30) > 1 ? 's' : ''} ago`;
  }

  _extractSkills({ rawSkills, qualifications, title, description }) {
    const skillSet = new Set();

    // Add provided skills
    rawSkills.forEach(s => {
      if (typeof s === 'string' && s.trim()) skillSet.add(s.trim());
    });

    // Known common technology keywords
    const commonTech = [
      'JavaScript', 'TypeScript', 'Python', 'Java', 'C++', 'C#', 'Golang', 'Go',
      'Rust', 'PHP', 'Ruby', 'Swift', 'Kotlin', 'SQL', 'PostgreSQL', 'MySQL',
      'MongoDB', 'Redis', 'Cassandra', 'DynamoDB', 'React', 'React.js', 'Next.js',
      'Vue.js', 'Angular', 'Node.js', 'Express', 'Django', 'FastAPI', 'Flask',
      'Spring Boot', 'GraphQL', 'REST API', 'Docker', 'Kubernetes', 'AWS',
      'Azure', 'GCP', 'Terraform', 'CI/CD', 'Git', 'Kafka', 'RabbitMQ',
      'Microservices', 'Distributed Systems', 'System Design', 'Agile', 'Scrum',
      'Machine Learning', 'TensorFlow', 'PyTorch', 'Tailwind CSS', 'Redux', 'HTML5', 'CSS3'
    ];

    const textToScan = `${title} ${qualifications.join(' ')} ${description}`;
    commonTech.forEach(tech => {
      const escaped = tech.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b${escaped}\\b`, 'i');
      if (regex.test(textToScan)) {
        skillSet.add(tech);
      }
    });

    const result = Array.from(skillSet);
    if (result.length === 0) {
      return ['Software Engineering', 'Problem Solving', 'System Design'];
    }
    return result.slice(0, 15);
  }
}

module.exports = JSearchAdapter;
