const JobProviderInterface = require('./jobProvider.interface');
const env = require('../../../config/env');
const ApiError = require('../../../utils/apiError');
const logger = require('../../../utils/logger');

class AdzunaAdapter extends JobProviderInterface {
  constructor(config = {}) {
    super();
    this.appId = config.appId || env.ADZUNA_APP_ID;
    this.appKey = config.appKey || env.ADZUNA_APP_KEY;
    this.baseUrl = 'https://api.adzuna.com/v1/api/jobs';
    this.timeoutMs = config.timeoutMs || 8000;
  }

  getProviderName() {
    return 'adzuna';
  }

  _isConfigured() {
    return Boolean(this.appId && this.appKey && this.appId.trim() && this.appKey.trim());
  }

  /**
   * Internal HTTP request helper with timeout and standardized error handling
   */
  async _fetch(endpointPath, params = {}) {
    if (!this._isConfigured()) {
      throw ApiError.serviceUnavailable(
        'Adzuna API credentials not configured. Please set ADZUNA_APP_ID and ADZUNA_APP_KEY in your server environment variables.'
      );
    }

    const url = new URL(`${this.baseUrl}${endpointPath}`);
    url.searchParams.append('app_id', this.appId);
    url.searchParams.append('app_key', this.appKey);
    url.searchParams.append('content-type', 'application/json');

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
        headers: { Accept: 'application/json' },
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw ApiError.unauthorized('Invalid or unauthorized Adzuna API credentials. Please check your App ID and App Key.');
        }
        if (response.status === 429) {
          throw ApiError.tooManyRequests('Adzuna API rate limit exceeded.');
        }
        const errText = await response.text().catch(() => '');
        throw ApiError.serviceUnavailable(`Adzuna API error (${response.status}): ${errText || response.statusText}`);
      }

      return await response.json();
    } catch (err) {
      clearTimeout(timeout);
      if (err.name === 'AbortError') {
        throw ApiError.serviceUnavailable('Adzuna API request timed out after 8 seconds.');
      }
      if (err instanceof ApiError) {
        throw err;
      }
      logger.error(`Adzuna adapter network error: ${err.message}`);
      throw ApiError.serviceUnavailable(`Could not connect to Adzuna API: ${err.message}`);
    }
  }

  /**
   * Searches live job vacancies via Adzuna /{country}/search/{page}
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
    const validCountries = ['in', 'us', 'gb', 'ca', 'au', 'de', 'fr', 'nl', 'sg'];
    const countryCode = validCountries.includes(country.toLowerCase()) ? country.toLowerCase() : 'in';

    const searchParams = {
      results_per_page: limit,
      what: query.trim()
    };

    if (location && location.trim()) {
      searchParams.where = location.trim();
    }

    if (salaryMin && Number(salaryMin) > 0) {
      searchParams.salary_min = Number(salaryMin);
    }

    if (employmentType && employmentType !== 'all') {
      const t = employmentType.toLowerCase();
      if (t === 'fulltime') searchParams.full_time = 1;
      else if (t === 'parttime') searchParams.part_time = 1;
      else if (t === 'contractor' || t === 'contract') searchParams.contract = 1;
    }

    const data = await this._fetch(`/${countryCode}/search/${page}`, searchParams);
    const rawResults = Array.isArray(data.results) ? data.results : [];

    let normalizedJobs = rawResults.map(raw => this.normalizeJob(raw, countryCode));

    if (remote === true || remote === 'true') {
      normalizedJobs = normalizedJobs.filter(j => j.location.isRemote || /remote|work from home/i.test(j.title + ' ' + j.description));
    }

    const total = data.count || normalizedJobs.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));

    return {
      jobs: normalizedJobs,
      total,
      page: Number(page),
      totalPages,
      provider: this.getProviderName()
    };
  }

  /**
   * Retrieves single job details (Adzuna doesn't have a direct single ID endpoint, so we search by ID or return cached)
   */
  async getJobDetails(jobId) {
    throw ApiError.notFound('Adzuna job details must be inspected from search results directly.');
  }

  /**
   * Retrieves historical market salary benchmarks via Adzuna /{country}/history
   */
  async getSalaryEstimate({ jobTitle, location = '', country = 'in' }) {
    try {
      const validCountries = ['in', 'us', 'gb', 'ca', 'au', 'de', 'fr', 'nl', 'sg'];
      const countryCode = validCountries.includes(country.toLowerCase()) ? country.toLowerCase() : 'in';

      const data = await this._fetch(`/${countryCode}/history`, {
        what: jobTitle,
        where: location || undefined
      });

      const monthData = data.month || {};
      const entries = Object.entries(monthData);

      if (entries.length === 0) {
        return {
          hasEstimate: false,
          source: 'Adzuna Market Index',
          message: 'Market estimate unavailable'
        };
      }

      // Sort by month ascending
      entries.sort((a, b) => a[0].localeCompare(b[0]));
      const recent = entries.slice(-6); // Last 6 months
      const latest = recent[recent.length - 1];
      const avg = Math.round(latest[1]);
      const currency = countryCode === 'in' ? 'INR' : countryCode === 'gb' ? 'GBP' : countryCode === 'us' ? 'USD' : 'EUR';

      return {
        hasEstimate: true,
        type: 'market_benchmark',
        average: avg,
        median: avg,
        currency,
        period: 'year',
        source: 'Adzuna Historical Market Index',
        location: location || countryCode.toUpperCase(),
        timePeriod: `${recent[0][0]} to ${latest[0]}`,
        history: recent.map(([m, val]) => ({ month: m, averageSalary: Math.round(val) }))
      };
    } catch (err) {
      logger.warn(`Adzuna history salary lookup failed: ${err.message}`);
      return {
        hasEstimate: false,
        source: 'Adzuna Market Index',
        message: 'Market estimate unavailable'
      };
    }
  }

  /**
   * Normalizes Adzuna job item into internal NormalizedJob format
   */
  normalizeJob(raw, defaultCountry = 'in') {
    const isIndian = defaultCountry.toLowerCase() === 'in';
    const currency = isIndian ? 'INR' : defaultCountry.toLowerCase() === 'gb' ? 'GBP' : 'USD';

    // 1. Posting date / freshness
    let postedAt = null;
    let postedAtDisplay = 'Posting date unavailable';

    if (raw.created) {
      try {
        const d = new Date(raw.created);
        if (!isNaN(d.getTime())) {
          postedAt = d.toISOString();
          postedAtDisplay = this._formatRelativeTime(d);
        }
      } catch (_) {}
    }

    // 2. Salary handling: Distinguish between advertiser-declared and predicted
    // Adzuna explicitly supplies salary_is_predicted: "1" (predicted) or "0" (employer advertised)
    const isPredicted = String(raw.salary_is_predicted) === '1';
    const hasSalary = (raw.salary_min != null || raw.salary_max != null) && (raw.salary_min > 0 || raw.salary_max > 0);

    const minSalary = raw.salary_min != null ? Math.round(raw.salary_min) : null;
    const maxSalary = raw.salary_max != null ? Math.round(raw.salary_max) : null;

    let salaryType = 'undisclosed';
    let salarySource = null;
    let displaySalary = 'Salary not disclosed';
    let normalizedAnnual = null;

    if (hasSalary) {
      if (isPredicted) {
        salaryType = 'estimated';
        salarySource = 'Adzuna Predictive Salary Model';
        displaySalary = `Est. ${this._formatSalaryDisplay(minSalary, maxSalary, currency, 'year')}`;
      } else {
        salaryType = 'advertised';
        salarySource = 'Employer Advertised';
        displaySalary = this._formatSalaryDisplay(minSalary, maxSalary, currency, 'year');
      }

      normalizedAnnual = {
        min: minSalary,
        max: maxSalary,
        currency
      };
    }

    // 3. Location & Workplace Type
    const locDisplay = raw.location?.display_name || 'Location unspecified';
    const isRemote = /remote|work from home|telecommute/i.test(`${raw.title} ${raw.description} ${locDisplay}`);
    const workplaceType = isRemote ? 'remote' : 'on-site';

    // 4. Skills extraction
    const extractedSkills = this._extractSkills(`${raw.title} ${raw.description}`);

    return {
      id: String(raw.id || `adzuna_${Date.now()}`),
      provider: 'adzuna',
      title: (raw.title || 'Untitled Role').replace(/<[^>]*>?/gm, ''), // strip any HTML tags
      employer: {
        name: raw.company?.display_name || 'Hiring Company',
        logo: null,
        website: null
      },
      location: {
        city: raw.location?.area?.[1] || null,
        state: raw.location?.area?.[0] || null,
        country: defaultCountry.toUpperCase(),
        displayLocation: locDisplay,
        isRemote,
        workplaceType
      },
      employmentType: raw.contract_time === 'part_time' ? 'part-time' : raw.contract_type === 'contract' ? 'contract' : 'full-time',
      experienceLevel: 'Not specified',
      experienceRequirementMonths: null,
      description: (raw.description || 'Job description unavailable').replace(/<[^>]*>?/gm, ''),
      requiredSkills: extractedSkills,
      qualifications: [],
      responsibilities: [],
      postedAt,
      postedAtDisplay,
      salary: {
        hasSalary,
        type: salaryType,
        min: minSalary,
        max: maxSalary,
        currency,
        period: 'year',
        isPredicted,
        displaySalary,
        normalizedAnnual,
        source: salarySource
      },
      source: 'Adzuna Job Network',
      applyUrl: raw.redirect_url || '#',
      isExpired: false
    };
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

  _extractSkills(text) {
    const skillSet = new Set();
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

    commonTech.forEach(tech => {
      const escaped = tech.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b${escaped}\\b`, 'i');
      if (regex.test(text)) {
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

module.exports = AdzunaAdapter;
