import 'dotenv/config';

export default {
  schema: 'prisma/schema.prisma',
  datasource: {
    url: process.env.DATABASE_URL || process.env.PRIMARY_DB_URL,
  },
};
