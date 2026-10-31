import request from 'supertest';
import { closeAll, describeIntegration, getApp, resetDb, signup } from './helpers';

const refreshCookie = (cookies: string[]) => cookies.find((c) => c.startsWith('te_rt='))!.split(';')[0];

describeIntegration('Auth', () => {
  beforeEach(resetDb);
  afterAll(closeAll);

  it('signs up, sets an HttpOnly refresh cookie and never returns the password hash', async () => {
    const res = await request(await getApp())
      .post('/api/auth/signup')
      .send({ name: 'Asha', email: 'asha@test.dev', password: 'Password123' })
      .expect(201);

    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.user).toEqual(expect.objectContaining({ email: 'asha@test.dev', role: 'STUDENT' }));
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
    const cookie = (res.headers['set-cookie'] as unknown as string[]).join(';');
    expect(cookie).toContain('HttpOnly');
  });

  it('rejects a duplicate email with 409', async () => {
    const app = await getApp();
    const body = { name: 'Asha', email: 'dup@test.dev', password: 'Password123' };
    await request(app).post('/api/auth/signup').send(body).expect(201);
    const res = await request(app).post('/api/auth/signup').send(body).expect(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('returns field errors from the shared schema', async () => {
    const res = await request(await getApp())
      .post('/api/auth/signup')
      .send({ name: 'A', email: 'nope', password: 'short' })
      .expect(400);
    expect(Object.keys(res.body.error.details)).toEqual(expect.arrayContaining(['name', 'email', 'password']));
  });

  it('rotates the refresh token, and reusing an old one revokes the whole session', async () => {
    const app = await getApp();
    const { cookie } = await signup();
    const first = refreshCookie(cookie);

    // First refresh succeeds and issues a NEW cookie
    const r1 = await request(app).post('/api/auth/refresh').set('Cookie', first).expect(200);
    const second = refreshCookie(r1.headers['set-cookie'] as unknown as string[]);
    expect(second).not.toEqual(first);

    // Replaying the OLD token = theft signal -> 401
    await request(app).post('/api/auth/refresh').set('Cookie', first).expect(401);

    // ...and the legitimate newer token is now dead too (family revoked)
    await request(app).post('/api/auth/refresh').set('Cookie', second).expect(401);
  });

  it('protects /me', async () => {
    const app = await getApp();
    await request(app).get('/api/auth/me').expect(401);
    const { token } = await signup();
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`).expect(200);
    expect(res.body.user.email).toMatch(/@test.dev$/);
  });
});
