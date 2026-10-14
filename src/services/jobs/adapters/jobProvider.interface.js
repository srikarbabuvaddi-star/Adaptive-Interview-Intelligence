/**
 * Abstract Base Class / Interface for Job Market Data Providers
 */
class JobProviderInterface {
  /**
   * Returns the provider identifier (e.g. 'jsearch', 'adzuna')
   * @returns {string}
   */
  getProviderName() {
    throw new Error('Not implemented: getProviderName()');
  }

  /**
   * Searches live job vacancies according to query and filters
   * @param {Object} params
   * @param {string} params.query - Keyword, job title, skill, or company
   * @param {string} [params.location] - City, state, or region
   * @param {string} [params.country='in'] - Country code (e.g. 'in', 'us', 'gb')
   * @param {boolean|string} [params.remote] - Remote filter (true, false, 'all')
   * @param {string} [params.experienceLevel] - 'entry', 'mid', 'senior', 'lead', or 'all'
   * @param {string} [params.employmentType] - 'fulltime', 'contractor', 'parttime', 'intern', or 'all'
   * @param {number} [params.salaryMin] - Minimum annual salary filter
   * @param {number} [params.page=1] - 1-based page number
   * @param {number} [params.limit=10] - Number of items per page
   * @returns {Promise<{ jobs: Array<Object>, total: number, page: number, totalPages: number, provider: string }>}
   */
  async searchJobs(params) {
    throw new Error('Not implemented: searchJobs()');
  }

  /**
   * Retrieves full details for a specific job posting
   * @param {string} jobId
   * @returns {Promise<Object>}
   */
  async getJobDetails(jobId) {
    throw new Error('Not implemented: getJobDetails()');
  }

  /**
   * Retrieves estimated market salary for a job title and location
   * @param {Object} params
   * @param {string} params.jobTitle
   * @param {string} [params.location]
   * @param {string} [params.country]
   * @returns {Promise<Object>}
   */
  async getSalaryEstimate(params) {
    throw new Error('Not implemented: getSalaryEstimate()');
  }
}

module.exports = JobProviderInterface;
