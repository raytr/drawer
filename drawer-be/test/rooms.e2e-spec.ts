import request from 'supertest';
import { startApp, type TestApp } from './helpers';

describe('POST /api/rooms (e2e)', () => {
  let t: TestApp;

  beforeEach(async () => {
    t = await startApp();
  });

  afterEach(async () => {
    await t.app.close();
  });

  it('returns 201 with a room id and an owner token', async () => {
    const res = await request(t.app.getHttpServer())
      .post('/api/rooms')
      .expect(201);
    expect(res.body.roomId).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(res.body.ownerToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});
