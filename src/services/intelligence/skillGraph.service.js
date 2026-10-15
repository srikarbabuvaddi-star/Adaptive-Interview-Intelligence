const { getCollection, COLLECTIONS } = require('../db/firestore.service');
const logger = require('../../utils/logger');

/**
 * Standard Curated Technical Skill Graph Nodes & Edge Topology
 */
const BASE_SKILL_GRAPH = {
  // Fundamentals
  data_structures: {
    id: 'data_structures',
    name: 'Data Structures & Algorithms',
    category: 'fundamentals',
    difficulty: 'intermediate',
    prerequisites: [],
    subskills: ['arrays_strings', 'hash_tables', 'trees_graphs', 'dynamic_programming']
  },
  networking: {
    id: 'networking',
    name: 'Computer Networking',
    category: 'fundamentals',
    difficulty: 'intermediate',
    prerequisites: [],
    subskills: ['tcp_ip', 'http_https', 'websockets', 'dns_routing']
  },
  operating_systems: {
    id: 'operating_systems',
    name: 'Operating Systems & Concurrency',
    category: 'fundamentals',
    difficulty: 'intermediate',
    prerequisites: [],
    subskills: ['threads_processes', 'concurrency_locks', 'memory_management', 'io_multiplexing']
  },

  // Languages
  javascript: {
    id: 'javascript',
    name: 'JavaScript',
    category: 'language',
    difficulty: 'basic',
    prerequisites: [],
    subskills: ['es6_syntax', 'event_loop', 'async_await', 'closures_prototypes']
  },
  typescript: {
    id: 'typescript',
    name: 'TypeScript',
    category: 'language',
    difficulty: 'intermediate',
    prerequisites: ['javascript'],
    subskills: ['type_annotations', 'generics', 'utility_types', 'declaration_files']
  },
  python: {
    id: 'python',
    name: 'Python',
    category: 'language',
    difficulty: 'basic',
    prerequisites: [],
    subskills: ['python_syntax', 'decorators', 'asyncio', 'generators']
  },

  // Frameworks & Runtimes
  react: {
    id: 'react',
    name: 'React.js',
    category: 'framework',
    difficulty: 'intermediate',
    prerequisites: ['javascript'],
    subskills: ['hooks', 'state_management', 'virtual_dom', 'performance_optimization']
  },
  node_js: {
    id: 'node_js',
    name: 'Node.js',
    category: 'framework',
    difficulty: 'intermediate',
    prerequisites: ['javascript', 'networking'],
    subskills: ['express_koa', 'event_emitter', 'streams_buffers', 'clustering']
  },
  fastapi: {
    id: 'fastapi',
    name: 'FastAPI',
    category: 'framework',
    difficulty: 'intermediate',
    prerequisites: ['python', 'networking'],
    subskills: ['starlette_pydantic', 'async_handlers', 'dependency_injection', 'openapi_spec']
  },

  // Data Stores
  sql_databases: {
    id: 'sql_databases',
    name: 'Relational SQL Databases',
    category: 'data_store',
    difficulty: 'intermediate',
    prerequisites: [],
    subskills: ['acid_transactions', 'indexing_b_trees', 'normalization', 'query_optimization']
  },
  redis: {
    id: 'redis',
    name: 'Redis',
    category: 'data_store',
    difficulty: 'intermediate',
    prerequisites: ['networking'],
    subskills: ['data_structures', 'pub_sub', 'sentinel_cluster', 'caching_strategies']
  },

  // Distributed Systems & Architecture
  distributed_systems: {
    id: 'distributed_systems',
    name: 'Distributed Systems',
    category: 'architecture',
    difficulty: 'advanced',
    prerequisites: ['networking', 'operating_systems'],
    subskills: ['cap_theorem', 'consensus_raft_paxos', 'replication_sharding', 'eventual_consistency']
  },
  microservices: {
    id: 'microservices',
    name: 'Microservices Architecture',
    category: 'architecture',
    difficulty: 'advanced',
    prerequisites: ['networking', 'distributed_systems'],
    subskills: ['api_gateway', 'service_discovery', 'circuit_breaker', 'distributed_tracing']
  },
  cloud_infrastructure: {
    id: 'cloud_infrastructure',
    name: 'Cloud Infrastructure & Containers',
    category: 'infrastructure',
    difficulty: 'intermediate',
    prerequisites: ['operating_systems', 'networking'],
    subskills: ['docker_containers', 'kubernetes_orchestration', 'ci_cd_pipelines', 'cloud_vpc']
  }
};

class SkillGraphService {
  constructor() {
    this.graph = new Map();
    this._initializeGraph();
  }

  _initializeGraph() {
    Object.entries(BASE_SKILL_GRAPH).forEach(([key, node]) => {
      const normalizedNode = {
        ...node,
        id: this._normalizeSkillId(key)
      };
      this.graph.set(this._normalizeSkillId(key), normalizedNode);
      if (node.name) {
        this.graph.set(this._normalizeSkillId(node.name), normalizedNode);
      }
    });
    logger.info(`[SkillGraphService] Loaded ${this.graph.size} standard skill graph nodes`);
  }

  _normalizeSkillId(skillName) {
    if (!skillName) return '';
    let norm = skillName
      .toLowerCase()
      .trim()
      .replace(/[\s\.\-]+/g, '_')
      .replace(/[^a-z0-9_]/g, '');

    // Common alias mappings
    if (norm === 'react_js') return 'react';
    if (norm === 'node_js' || norm === 'nodejs') return 'node_js';
    if (norm === 'microservices_architecture') return 'microservices';
    if (norm === 'relational_sql_databases') return 'sql_databases';
    if (norm === 'data_structures_algorithms') return 'data_structures';

    return norm;
  }

  /**
   * Retrieves a node from the skill graph
   */
  getSkillNode(skillName) {
    const id = this._normalizeSkillId(skillName);
    return this.graph.get(id) || null;
  }

  /**
   * Returns all direct and indirect prerequisites for a target skill
   */
  getPrerequisites(skillName) {
    const id = this._normalizeSkillId(skillName);
    const node = this.graph.get(id);
    if (!node) return [];

    const prerequisites = new Set();
    const queue = [...node.prerequisites];

    while (queue.length > 0) {
      const currentId = queue.shift();
      if (!prerequisites.has(currentId)) {
        prerequisites.add(currentId);
        const parentNode = this.graph.get(currentId);
        if (parentNode && parentNode.prerequisites) {
          queue.push(...parentNode.prerequisites);
        }
      }
    }

    return Array.from(prerequisites).map(pid => this.graph.get(pid)).filter(Boolean);
  }

  /**
   * Identifies prerequisites for a skill that the candidate has NOT demonstrated
   */
  findMissingPrerequisites(targetSkillName, demonstratedSkillNames = []) {
    const targetPrereqs = this.getPrerequisites(targetSkillName);
    const normalizedDemonstrated = new Set(
      demonstratedSkillNames.map(s => this._normalizeSkillId(typeof s === 'string' ? s : s.name || s.skill))
    );

    const missing = targetPrereqs.filter(prereq => !normalizedDemonstrated.has(prereq.id));
    return missing;
  }

  /**
   * Graph-aware topic recommender:
   * Prioritizes required job skills, but inspects prerequisites first when a candidate struggles
   */
  recommendNextTopic({ jobRequiredSkills = [], demonstratedSkills = [], weakSkills = [], unassessedSkills = [] }) {
    const normalizedDemonstrated = new Set(
      demonstratedSkills.map(s => this._normalizeSkillId(typeof s === 'string' ? s : s.name || s.skill))
    );
    const normalizedWeak = new Set(
      weakSkills.map(s => this._normalizeSkillId(typeof s === 'string' ? s : s.name || s.skill))
    );

    // 1. If candidate struggled with a skill, check if they have missing fundamental prerequisites
    for (const weak of weakSkills) {
      const weakName = typeof weak === 'string' ? weak : weak.name || weak.skill;
      const missingPrereqs = this.findMissingPrerequisites(weakName, demonstratedSkills);
      if (missingPrereqs.length > 0) {
        return {
          skill: missingPrereqs[0].name,
          difficulty: 'basic',
          rationale: `Candidate struggled with ${weakName}. Probing foundational prerequisite ${missingPrereqs[0].name} to isolate root skill gap.`,
          isPrerequisiteProbe: true,
          prerequisiteFor: weakName
        };
      }
    }

    // 2. Select next unassessed required job skill that has all prerequisites met
    for (const reqSkill of jobRequiredSkills) {
      const skillName = typeof reqSkill === 'string' ? reqSkill : reqSkill.name;
      const skillId = this._normalizeSkillId(skillName);

      if (!normalizedDemonstrated.has(skillId) && !normalizedWeak.has(skillId)) {
        return {
          skill: skillName,
          difficulty: reqSkill.minimumLevel || 'intermediate',
          rationale: `Assessing core unverified competency for ${skillName}.`,
          isPrerequisiteProbe: false
        };
      }
    }

    // 3. Fallback to first available unassessed skill
    if (unassessedSkills.length > 0) {
      const fallback = unassessedSkills[0];
      const fallbackName = typeof fallback === 'string' ? fallback : fallback.name;
      return {
        skill: fallbackName,
        difficulty: 'intermediate',
        rationale: `Expanding assessment coverage to unassessed skill ${fallbackName}.`,
        isPrerequisiteProbe: false
      };
    }

    // 4. Default to higher difficulty probe on top required skill
    const primary = jobRequiredSkills[0];
    const primaryName = typeof primary === 'string' ? primary : primary?.name || 'Software Engineering';
    return {
      skill: primaryName,
      difficulty: 'advanced',
      rationale: `Deepening technical validation on primary core skill ${primaryName}.`,
      isPrerequisiteProbe: false
    };
  }

  /**
   * Synthesizes candidate competency graph explicitly distinguishing verified, weak, and unassessed skills
   */
  generateGraphEvidence({ candidateId, evaluations = [], jobSkills = [] }) {
    const assessedMap = new Map();

    evaluations.forEach(ev => {
      const norm = this._normalizeSkillId(ev.skill);
      if (!assessedMap.has(norm)) {
        assessedMap.set(norm, { scores: [], evidence: [] });
      }
      assessedMap.get(norm).scores.push(ev.score);
      if (ev.evidence) assessedMap.get(norm).evidence.push(...(Array.isArray(ev.evidence) ? ev.evidence : [ev.evidence]));
    });

    const verifiedSkills = [];
    const identifiedGaps = [];
    const unassessedSkills = [];

    jobSkills.forEach(js => {
      const skillName = typeof js === 'string' ? js : js.name;
      const norm = this._normalizeSkillId(skillName);
      const node = this.getSkillNode(skillName);

      if (assessedMap.has(norm)) {
        const data = assessedMap.get(norm);
        const avgScore = data.scores.reduce((a, b) => a + b, 0) / data.scores.length;
        if (avgScore >= 6.5) {
          verifiedSkills.push({
            skill: skillName,
            averageScore: Math.round(avgScore * 10) / 10,
            evidence: data.evidence.slice(0, 3),
            status: 'demonstrated'
          });
        } else {
          identifiedGaps.push({
            skill: skillName,
            averageScore: Math.round(avgScore * 10) / 10,
            evidence: data.evidence.slice(0, 3),
            status: 'gap_identified',
            missingPrerequisites: this.findMissingPrerequisites(skillName, verifiedSkills.map(v => v.skill))
          });
        }
      } else {
        unassessedSkills.push({
          skill: skillName,
          status: 'unassessed',
          note: 'No direct interview evidence collected yet; proficiency unconfirmed.',
          prerequisites: node ? node.prerequisites : []
        });
      }
    });

    return {
      candidateId,
      verifiedSkills,
      identifiedGaps,
      unassessedSkills,
      coverageRatio: jobSkills.length > 0 ? (verifiedSkills.length + identifiedGaps.length) / jobSkills.length : 1.0,
      evaluatedAt: new Date().toISOString()
    };
  }
}

// Export singleton instance
module.exports = new SkillGraphService();
