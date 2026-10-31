// Safe defaults so tests never need a real .env. CI overrides DATABASE_URL / MONGO_URL.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??= 'mysql://talented:talentedpass@localhost:3306/talented_test';
process.env.MONGO_URL ??= 'mongodb://localhost:27017/talented_test';
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret-that-is-long-enough-123456';
process.env.REFRESH_TOKEN_PEPPER ??= 'test-refresh-pepper-1234567890';
process.env.INTERNAL_API_KEY ??= 'test-internal-key';
process.env.RAZORPAY_KEY_SECRET ??= 'rzp_test_secret';
process.env.RAZORPAY_WEBHOOK_SECRET ??= 'rzp_webhook_secret';
process.env.PUBLIC_URL ??= 'http://localhost:5173';
