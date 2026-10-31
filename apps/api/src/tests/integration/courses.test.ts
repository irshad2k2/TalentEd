import request from 'supertest';
import { prisma } from '../../config/db';
import { fulfil } from '../../modules/payments/payments.service';
import { closeAll, describeIntegration, educatorWithCourse, getApp, resetDb, signup } from './helpers';

describeIntegration('Courses, access and payments', () => {
  beforeEach(resetDb);
  afterAll(closeAll);

  it('students cannot create courses (403)', async () => {
    const { token } = await signup('STUDENT');
    await request(await getApp())
      .post('/api/courses')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Nope', description: 'Students cannot do this', category: 'X', pricePaise: 0 })
      .expect(403);
  });

  it("another educator's course returns 404, not 403", async () => {
    const { course } = await educatorWithCourse();
    const other = await signup('EDUCATOR');
    await request(await getApp())
      .patch(`/api/courses/${course.id}`)
      .set('Authorization', `Bearer ${other.token}`)
      .send({ title: 'Hijacked title' })
      .expect(404);
  });

  it('a student must enroll before reading a lesson', async () => {
    const app = await getApp();
    const { course } = await educatorWithCourse();
    const student = await signup();
    const lessonUrl = `/api/courses/${course.id}/lessons/${course.lessons[0].id}`;

    const denied = await request(app).get(lessonUrl).set('Authorization', `Bearer ${student.token}`).expect(403);
    expect(denied.body.error.code).toBe('NOT_ENROLLED');

    await request(app).post(`/api/courses/${course.id}/enroll`).set('Authorization', `Bearer ${student.token}`).expect(201);
    const ok = await request(app).get(lessonUrl).set('Authorization', `Bearer ${student.token}`).expect(200);
    expect(ok.body.lesson.content).toBe('Hello world');
  });

  it('paid courses cannot be enrolled for free (402)', async () => {
    const { course } = await educatorWithCourse(49900);
    const student = await signup();
    await request(await getApp())
      .post(`/api/courses/${course.id}/enroll`)
      .set('Authorization', `Bearer ${student.token}`)
      .expect(402);
  });

  it('callback and webhook racing for the same payment enroll exactly once', async () => {
    const { course } = await educatorWithCourse(49900);
    const student = await signup();
    const order = await prisma.order.create({
      data: { userId: student.user.id, courseId: course.id, razorpayOrderId: 'order_race', amountPaise: 49900 },
    });

    // Fire both paths at the same time
    const results = await Promise.all([
      fulfil(order.id, 'pay_race', 49900, 'CALLBACK'),
      fulfil(order.id, 'pay_race', 49900, 'WEBHOOK'),
    ]);

    expect(results.filter((r) => r.alreadyProcessed)).toHaveLength(1);
    expect(await prisma.payment.count({ where: { razorpayPaymentId: 'pay_race' } })).toBe(1);
    expect(await prisma.enrollment.count({ where: { userId: student.user.id, courseId: course.id } })).toBe(1);
  });

  it('GraphQL catalog paginates with a cursor and hides drafts', async () => {
    const app = await getApp();
    const { edu } = await educatorWithCourse();
    await prisma.course.createMany({
      data: [
        { educatorId: edu.user.id, title: 'Two', description: 'Second course here', category: 'A', published: true },
        { educatorId: edu.user.id, title: 'Three', description: 'Third course here', category: 'A', published: true },
        { educatorId: edu.user.id, title: 'Draft', description: 'Not visible yet', category: 'A', published: false },
      ],
    });

    const query = `query($after: String) { courses(first: 2, after: $after) { items { title } nextCursor } }`;
    const page1 = await request(app).post('/graphql').send({ query }).expect(200);
    expect(page1.body.data.courses.items).toHaveLength(2);
    expect(page1.body.data.courses.nextCursor).toEqual(expect.any(String));

    const page2 = await request(app)
      .post('/graphql')
      .send({ query, variables: { after: page1.body.data.courses.nextCursor } })
      .expect(200);
    const titles = [...page1.body.data.courses.items, ...page2.body.data.courses.items].map((c: { title: string }) => c.title);
    expect(titles).toHaveLength(3);
    expect(titles).not.toContain('Draft');
    expect(page2.body.data.courses.nextCursor).toBeNull();
  });
});
