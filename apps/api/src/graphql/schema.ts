/**
 * GraphQL is used for READS: the catalog and course pages ask for exactly the fields they show,
 * in one round trip. Writes stay REST (see modules/*), where HTTP verbs and status codes fit.
 */
export const typeDefs = /* GraphQL */ `
  type Educator {
    id: ID!
    name: String!
  }

  type LessonSummary {
    id: ID!
    title: String!
    position: Int!
    hasVideo: Boolean!
    "Only meaningful for a signed-in student"
    completed: Boolean!
  }

  type Course {
    id: ID!
    title: String!
    description: String!
    category: String!
    "Price in paise (INR x 100). 0 = free."
    pricePaise: Int!
    published: Boolean!
    educator: Educator!
    lessonCount: Int!
    enrollmentCount: Int!
    lessons: [LessonSummary!]!
    isEnrolled: Boolean!
    isOwner: Boolean!
    "0-100 for an enrolled student, null otherwise"
    progressPercent: Int
  }

  "Cursor pagination: pass nextCursor back as 'after' to get the next page."
  type CoursePage {
    items: [Course!]!
    nextCursor: String
  }

  type Query {
    courses(first: Int = 12, after: String, category: String, search: String): CoursePage!
    course(id: ID!): Course
    categories: [String!]!
    myEnrollments: [Course!]!
    myCourses: [Course!]!
  }
`;
