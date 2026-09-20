import { MongoClient } from 'mongodb';
import { logger } from './logger.js';
import crypto from 'crypto';

/**
 * Native High-Speed MongoDB Prisma Adapter
 * Provides standard Prisma-compatible CRUD interface directly on MongoDB Atlas
 * Enables hot-swapping between PostgreSQL and MongoDB at runtime with zero downtime.
 */

const MODEL_COLLECTIONS = {
  user: 'User',
  module: 'Module',
  section: 'Section',
  lesson: 'Lesson',
  assignment: 'Assignment',
  courseEnrollmentRequest: 'CourseEnrollmentRequest',
  assessment: 'Assessment',
  assessmentSubmission: 'AssessmentSubmission',
  certificate: 'Certificate',
  notification: 'Notification',
  auditLog: 'AuditLog',
  chatMessage: 'ChatMessage',
  transferRequest: 'TransferRequest',
  activeSession: 'ActiveSession',
};

// Translate Prisma where queries into MongoDB query filters
function translateWhere(where = {}) {
  if (!where || typeof where !== 'object') return {};
  const filter = {};

  for (const [key, val] of Object.entries(where)) {
    if (key === 'OR' && Array.isArray(val)) {
      filter.$or = val.map(translateWhere);
      continue;
    }
    if (key === 'AND' && Array.isArray(val)) {
      filter.$and = val.map(translateWhere);
      continue;
    }
    if (key === 'id') {
      if (typeof val === 'object' && val !== null) {
        if (val.in && Array.isArray(val.in)) {
          filter.$or = [{ id: { $in: val.in } }, { _id: { $in: val.in } }];
          continue;
        }
        if (val.not !== undefined) {
          filter.$and = [{ id: { $ne: val.not } }, { _id: { $ne: val.not } }];
          continue;
        }
      }
      filter.$or = [{ id: val }, { _id: val }];
      continue;
    }
    if (key === 'userId_moduleId' && typeof val === 'object' && val !== null) {
      filter.userId = val.userId;
      filter.moduleId = val.moduleId;
      continue;
    }

    if ((key === 'read' || key === 'isRead') && val === false) {
      filter[key] = { $ne: true };
    } else if (val && typeof val === 'object' && !Array.isArray(val) && !(val instanceof Date)) {
      const subFilter = {};
      for (const [op, opVal] of Object.entries(val)) {
        if (op === 'in') subFilter.$in = opVal;
        else if (op === 'notIn') subFilter.$nin = opVal;
        else if (op === 'gte') subFilter.$gte = opVal;
        else if (op === 'lte') subFilter.$lte = opVal;
        else if (op === 'gt') subFilter.$gt = opVal;
        else if (op === 'lt') subFilter.$lt = opVal;
        else if (op === 'contains') subFilter.$regex = new RegExp(opVal, 'i');
        else if (op === 'not') subFilter.$ne = opVal;
        else subFilter[op] = opVal;
      }
      filter[key] = subFilter;
    } else {
      filter[key] = val;
    }
  }

  return filter;
}

// Translate Prisma orderBy into MongoDB sort
function translateOrderBy(orderBy) {
  if (!orderBy) return { createdAt: -1 };
  if (Array.isArray(orderBy)) {
    const sort = {};
    for (const item of orderBy) {
      for (const [k, v] of Object.entries(item)) {
        sort[k] = v === 'desc' ? -1 : 1;
      }
    }
    return sort;
  }
  const sort = {};
  for (const [k, v] of Object.entries(orderBy)) {
    sort[k] = v === 'desc' ? -1 : 1;
  }
  return sort;
}

// Apply field selection
function applySelect(doc, select) {
  if (!doc || !select || typeof select !== 'object') return doc;
  const result = {};
  for (const [field, isSelected] of Object.entries(select)) {
    if (isSelected && field !== '_count') {
      result[field] = doc[field];
    }
  }
  return result;
}

export class MongoAdapter {
  constructor(url) {
    this.url = url;
    this.client = null;
    this.db = null;
    this.isConnected = false;
    this.initModels();
  }

  async connect() {
    if (this.isConnected && this.db) return this.db;
    if (!this.url) {
      throw new Error('MongoDB connection URL is missing.');
    }

    const isSrv = this.url.startsWith('mongodb+srv://') || this.url.includes('ssl=true') || this.url.includes('tls=true');
    const options = {
      connectTimeoutMS: 15000,
      serverSelectionTimeoutMS: 15000,
      maxPoolSize: 20,
    };
    if (isSrv) {
      options.tls = true;
      options.tlsAllowInvalidCertificates = true;
    }

    this.client = new MongoClient(this.url, options);
    await this.client.connect();
    this.db = this.client.db();
    this.isConnected = true;
    logger.info(`✅ MongoAdapter connected to live MongoDB database: ${this.db.databaseName}`);
    return this.db;
  }

  async close() {
    if (this.client) {
      try {
        await this.client.close();
      } catch {}
      this.client = null;
      this.db = null;
      this.isConnected = false;
    }
  }

  getCollection(modelName) {
    const collName = MODEL_COLLECTIONS[modelName] || modelName;
    return this.db.collection(collName);
  }

  initModels() {
    for (const [modelKey, collName] of Object.entries(MODEL_COLLECTIONS)) {
      this[modelKey] = this.createModelHandler(modelKey, collName);
    }
  }

  createModelHandler(modelKey, collName) {
    const self = this;

    return {
      async findUnique(args = {}) {
        await self.connect();
        const coll = self.getCollection(modelKey);
        const filter = translateWhere(args.where);
        const doc = await coll.findOne(filter);
        if (!doc) return null;

        let result = { ...doc };
        if (result._id && !result.id) result.id = String(result._id);

        if (args.include) {
          result = await self.handleInclude(modelKey, result, args.include);
        }
        if (args.select) {
          result = applySelect(result, args.select);
        }
        return result;
      },

      async findFirst(args = {}) {
        await self.connect();
        const coll = self.getCollection(modelKey);
        const filter = translateWhere(args.where);
        const sort = translateOrderBy(args.orderBy);
        const doc = await coll.findOne(filter, { sort });
        if (!doc) return null;

        let result = { ...doc };
        if (result._id && !result.id) result.id = String(result._id);
        if (args.select) result = applySelect(result, args.select);
        return result;
      },

      async findMany(args = {}) {
        await self.connect();
        const coll = self.getCollection(modelKey);
        const filter = translateWhere(args.where);
        const sort = translateOrderBy(args.orderBy);
        const skip = Number(args.skip) || 0;
        const limit = Number(args.take) || 0;

        let cursor = coll.find(filter).sort(sort);
        if (skip > 0) cursor = cursor.skip(skip);
        if (limit > 0) cursor = cursor.limit(limit);

        const docs = await cursor.toArray();
        const results = [];

        for (let doc of docs) {
          let item = { ...doc };
          if (item._id && !item.id) item.id = String(item._id);

          if (args.include) {
            item = await self.handleInclude(modelKey, item, args.include);
          }
          if (args.select) {
            item = applySelect(item, args.select);
          }
          results.push(item);
        }

        return results;
      },

      async create(args = {}) {
        await self.connect();
        const coll = self.getCollection(modelKey);
        const data = { ...args.data };
        if (!data.id) data.id = crypto.randomUUID();
        data._id = data.id;
        if (!data.createdAt) data.createdAt = new Date();
        if (!data.updatedAt) data.updatedAt = new Date();

        await coll.insertOne(data);
        let result = { ...data };
        if (args.select) result = applySelect(result, args.select);
        return result;
      },

      async update(args = {}) {
        await self.connect();
        const coll = self.getCollection(modelKey);
        const filter = translateWhere(args.where);
        const data = { ...args.data, updatedAt: new Date() };

        await coll.updateOne(filter, { $set: data });
        const updated = await coll.findOne(filter);
        let result = updated ? { ...updated } : { ...data, ...args.where };
        if (result._id && !result.id) result.id = String(result._id);
        if (args.select) result = applySelect(result, args.select);
        return result;
      },

      async updateMany(args = {}) {
        await self.connect();
        const coll = self.getCollection(modelKey);
        const filter = translateWhere(args.where);
        const data = { ...args.data, updatedAt: new Date() };

        const res = await coll.updateMany(filter, { $set: data });
        return { count: res.modifiedCount };
      },

      async delete(args = {}) {
        await self.connect();
        const coll = self.getCollection(modelKey);
        const filter = translateWhere(args.where);
        await coll.deleteOne(filter);
        return { success: true };
      },

      async deleteMany(args = {}) {
        await self.connect();
        const coll = self.getCollection(modelKey);
        const filter = translateWhere(args.where);
        const res = await coll.deleteMany(filter);
        return { count: res.deletedCount };
      },

      async count(args = {}) {
        await self.connect();
        const coll = self.getCollection(modelKey);
        const filter = translateWhere(args.where);
        return await coll.countDocuments(filter);
      },
    };
  }

  // Handle nested Prisma includes in MongoDB documents
  async handleInclude(modelKey, doc, include) {
    if (!include || typeof include !== 'object') return doc;
    const result = { ...doc };

    if (modelKey === 'module') {
      if (include.sections) {
        const sections = await this.section.findMany({
          where: { moduleId: doc.id },
          orderBy: { order: 'asc' },
        });
        if (include.sections.include && include.sections.include.lessons) {
          for (let sec of sections) {
            sec.lessons = await this.lesson.findMany({
              where: { sectionId: sec.id },
              orderBy: { order: 'asc' },
            });
          }
        }
        result.sections = sections;
      }
      if (include.assessments) {
        result.assessments = await this.assessment.findMany({
          where: { moduleId: doc.id },
        });
      }
      if (include._count) {
        result._count = {
          sections: await this.section.count({ where: { moduleId: doc.id } }),
          assignments: await this.assignment.count({ where: { moduleId: doc.id } }),
        };
      }
    }

    if (modelKey === 'courseEnrollmentRequest') {
      if (include.student) {
        result.student = await this.user.findUnique({
          where: { id: doc.studentId },
          select: include.student.select,
        });
      }
      if (include.module) {
        result.module = await this.module.findUnique({
          where: { id: doc.moduleId },
          select: include.module.select,
        });
      }
    }

    if (modelKey === 'assignment') {
      if (include.module) {
        result.module = await this.module.findUnique({
          where: { id: doc.moduleId },
          include: include.module.include,
        });
      }
    }

    if (modelKey === 'assessment') {
      if (include.module) {
        result.module = await this.module.findUnique({
          where: { id: doc.moduleId },
          select: include.module.select,
        });
      }
      if (include.submissions) {
        result.submissions = await this.assessmentSubmission.findMany({
          where: { assessmentId: doc.id },
        });
      }
      if (include._count) {
        result._count = {
          submissions: await this.assessmentSubmission.count({ where: { assessmentId: doc.id } }),
        };
      }
    }

    return result;
  }
}
