const logger = require('../../utils/logger');

class VectorStore {
  constructor(dimensions = 64) {
    this.dimensions = dimensions;
    // Namespaces: Map<namespace, Map<docId, { id, text, vector, metadata, updatedAt }>>
    this.namespaces = new Map([
      ['knowledge_base', new Map()],
      ['candidate_private', new Map()]
    ]);
  }

  /**
   * Deterministic semantic high-dimensional embedding generator
   * Computes normalized vector based on term frequency, character n-grams, and semantic buckets
   */
  generateEmbedding(text) {
    if (!text || typeof text !== 'string') {
      return new Array(this.dimensions).fill(0);
    }

    const vector = new Array(this.dimensions).fill(0);
    const cleaned = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
    const tokens = cleaned.split(/\s+/).filter(Boolean);

    // 1. Unigram feature hashing
    for (const token of tokens) {
      let hash = 0;
      for (let i = 0; i < token.length; i++) {
        hash = (hash * 31 + token.charCodeAt(i)) & 0xffffffff;
      }
      const idx = Math.abs(hash) % this.dimensions;
      vector[idx] += 1.0;
    }

    // 2. Bigram context hashing
    for (let i = 0; i < tokens.length - 1; i++) {
      const bigram = `${tokens[i]}_${tokens[i + 1]}`;
      let hash = 0;
      for (let j = 0; j < bigram.length; j++) {
        hash = (hash * 37 + bigram.charCodeAt(j)) & 0xffffffff;
      }
      const idx = Math.abs(hash) % this.dimensions;
      vector[idx] += 1.5;
    }

    // 3. Normalize vector to unit length (L2 norm)
    const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    if (norm === 0) return vector;

    return vector.map(v => v / norm);
  }

  /**
   * Computes cosine similarity between two unit vectors
   */
  cosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
    let dot = 0;
    for (let i = 0; i < vecA.length; i++) {
      dot += vecA[i] * vecB[i];
    }
    return dot;
  }

  _getNamespace(namespace = 'knowledge_base') {
    if (!this.namespaces.has(namespace)) {
      this.namespaces.set(namespace, new Map());
    }
    return this.namespaces.get(namespace);
  }

  /**
   * Inserts or updates an embedded document in the specified namespace
   */
  addDocument({ id, text, metadata = {}, namespace = 'knowledge_base' }) {
    if (!id || !text) {
      throw new Error('Document id and text are required for vector indexing');
    }

    const vector = this.generateEmbedding(text);
    const store = this._getNamespace(namespace);

    store.set(id, {
      id,
      text,
      vector,
      metadata,
      updatedAt: Date.now()
    });

    return { id, namespace, dimensions: this.dimensions };
  }

  /**
   * Batch adds multiple documents
   */
  addDocuments(documents = [], namespace = 'knowledge_base') {
    return documents.map(doc => this.addDocument({ ...doc, namespace }));
  }

  /**
   * Semantic similarity search against a specific namespace
   */
  search({ query, namespace = 'knowledge_base', topK = 3, minScore = 0.1, filter = null }) {
    if (!query || typeof query !== 'string') return [];

    const queryVector = this.generateEmbedding(query);
    const store = this._getNamespace(namespace);
    const matches = [];

    for (const [id, doc] of store.entries()) {
      // Optional metadata filter
      if (typeof filter === 'function' && !filter(doc.metadata)) {
        continue;
      }

      const score = this.cosineSimilarity(queryVector, doc.vector);
      if (score >= minScore) {
        matches.push({
          id: doc.id,
          text: doc.text,
          metadata: doc.metadata,
          score: Math.round(score * 1000) / 1000
        });
      }
    }

    // Sort descending by similarity score
    matches.sort((a, b) => b.score - a.score);
    return matches.slice(0, topK);
  }

  deleteDocument(id, namespace = 'knowledge_base') {
    const store = this._getNamespace(namespace);
    return store.delete(id);
  }

  getDocument(id, namespace = 'knowledge_base') {
    const store = this._getNamespace(namespace);
    return store.get(id) || null;
  }

  clearNamespace(namespace = 'knowledge_base') {
    const store = this._getNamespace(namespace);
    store.clear();
  }

  getCount(namespace = 'knowledge_base') {
    const store = this._getNamespace(namespace);
    return store.size;
  }
}

// Export singleton instance with 64 dimensions
module.exports = new VectorStore(64);
