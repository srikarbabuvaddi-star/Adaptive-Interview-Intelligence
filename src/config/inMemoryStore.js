const { v4: uuidv4 } = require('uuid');

/**
 * In-Memory Firestore and Firebase Auth simulation
 * Used during automated testing and when no Google Cloud credentials are supplied locally.
 */
class InMemoryStore {
  constructor() {
    this.collections = new Map();
    this.users = new Map();
  }

  _getCollection(name) {
    if (!this.collections.has(name)) {
      this.collections.set(name, new Map());
    }
    return this.collections.get(name);
  }

  getFirestore() {
    const self = this;

    class Query {
      constructor(collectionName, filters = [], sortField = null, sortDir = 'asc', limitCount = null) {
        this.collectionName = collectionName;
        this.filters = filters;
        this.sortField = sortField;
        this.sortDir = sortDir;
        this.limitCount = limitCount;
      }

      where(field, op, value) {
        return new Query(
          this.collectionName,
          [...this.filters, { field, op, value }],
          this.sortField,
          this.sortDir,
          this.limitCount
        );
      }

      orderBy(field, dir = 'asc') {
        return new Query(this.collectionName, this.filters, field, dir, this.limitCount);
      }

      limit(n) {
        return new Query(this.collectionName, this.filters, this.sortField, this.sortDir, n);
      }

      async get() {
        const col = self._getCollection(this.collectionName);
        let items = Array.from(col.entries()).map(([id, data]) => ({
          id,
          ...JSON.parse(JSON.stringify(data))
        }));

        for (const f of this.filters) {
          items = items.filter(item => {
            const val = item[f.field];
            switch (f.op) {
              case '===':
              case '==':
                return val === f.value;
              case '!=':
                return val !== f.value;
              case '>':
                return val > f.value;
              case '>=':
                return val >= f.value;
              case '<':
                return val < f.value;
              case '<=':
                return val <= f.value;
              case 'array-contains':
                return Array.isArray(val) && val.includes(f.value);
              case 'in':
                return Array.isArray(f.value) && f.value.includes(val);
              default:
                return true;
            }
          });
        }

        if (this.sortField) {
          const field = this.sortField;
          const mult = this.sortDir === 'desc' ? -1 : 1;
          items.sort((a, b) => {
            if (a[field] < b[field]) return -1 * mult;
            if (a[field] > b[field]) return 1 * mult;
            return 0;
          });
        }

        if (typeof this.limitCount === 'number') {
          items = items.slice(0, this.limitCount);
        }

        const docs = items.map(docData => ({
          id: docData.id,
          exists: true,
          data: () => {
            const copy = { ...docData };
            delete copy.id;
            return copy;
          }
        }));

        return {
          empty: docs.length === 0,
          size: docs.length,
          docs,
          forEach: cb => docs.forEach(cb)
        };
      }
    }

    class DocumentReference {
      constructor(collectionName, id) {
        this.collectionName = collectionName;
        this.id = id;
      }

      async get() {
        const col = self._getCollection(this.collectionName);
        const data = col.get(this.id);
        return {
          id: this.id,
          exists: Boolean(data),
          data: () => (data ? JSON.parse(JSON.stringify(data)) : undefined)
        };
      }

      async set(data, options = {}) {
        const col = self._getCollection(this.collectionName);
        const existing = col.get(this.id) || {};
        const merged = options.merge
          ? { ...existing, ...JSON.parse(JSON.stringify(data)) }
          : JSON.parse(JSON.stringify(data));
        col.set(this.id, merged);
        return { writeTime: new Date() };
      }

      async update(data) {
        const col = self._getCollection(this.collectionName);
        const existing = col.get(this.id);
        if (!existing) {
          throw new Error(`NOT_FOUND: No document to update: ${this.id}`);
        }
        col.set(this.id, { ...existing, ...JSON.parse(JSON.stringify(data)) });
        return { writeTime: new Date() };
      }

      async delete() {
        const col = self._getCollection(this.collectionName);
        col.delete(this.id);
        return { writeTime: new Date() };
      }
    }

    class CollectionReference extends Query {
      constructor(collectionName) {
        super(collectionName);
      }

      doc(id) {
        const docId = id || uuidv4();
        return new DocumentReference(this.collectionName, docId);
      }

      async add(data) {
        const id = uuidv4();
        const docRef = this.doc(id);
        await docRef.set(data);
        return docRef;
      }
    }

    return {
      collection: name => new CollectionReference(name),
      batch: () => ({
        set: (ref, data, opts) => ref.set(data, opts),
        update: (ref, data) => ref.update(data),
        delete: ref => ref.delete(),
        commit: async () => {}
      }),
      runTransaction: async updateFunction => {
        const transaction = {
          get: async ref => ref.get(),
          set: (ref, data, opts) => ref.set(data, opts),
          update: (ref, data) => ref.update(data),
          delete: ref => ref.delete()
        };
        return updateFunction(transaction);
      }
    };
  }

  getAuth() {
    const self = this;
    return {
      async verifyIdToken(token) {
        if (!token) {
          throw new Error('Token is missing');
        }

        // Mock token support for local development / testing:
        // Format: "mock-{uid}" or "mock-{uid}-recruiter" or "mock-{uid}-candidate"
        if (token.startsWith('mock-') || token.startsWith('test-token-')) {
          const prefix = token.startsWith('mock-') ? 'mock-' : 'test-token-';
          const withoutPrefix = token.slice(prefix.length);
          let uid = withoutPrefix;
          let role = 'candidate';
          if (withoutPrefix.endsWith('-recruiter')) {
            role = 'recruiter';
            uid = withoutPrefix.slice(0, -'-recruiter'.length);
          } else if (withoutPrefix.endsWith('-candidate')) {
            role = 'candidate';
            uid = withoutPrefix.slice(0, -'-candidate'.length);
          }
          return {
            uid,
            email: `${uid}@test.com`,
            role,
            name: `Test User ${uid}`
          };
        }

        // If JWT format with base64 encoded payload:
        const parts = token.split('.');
        if (parts.length === 3) {
          try {
            const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
            if (payload && (payload.user_id || payload.uid || payload.sub)) {
              return {
                uid: payload.user_id || payload.uid || payload.sub,
                email: payload.email || 'user@example.com',
                name: payload.name || 'User',
                role: payload.role || 'candidate'
              };
            }
          } catch {
            // fallthrough
          }
        }

        throw new Error('Firebase ID token has invalid signature or format');
      },

      async setCustomUserClaims(uid, claims) {
        const current = self.users.get(uid) || {};
        self.users.set(uid, { ...current, customClaims: claims });
      },

      async getUser(uid) {
        const user = self.users.get(uid);
        if (!user) throw new Error(`User not found: ${uid}`);
        return user;
      }
    };
  }
}

module.exports = InMemoryStore;
