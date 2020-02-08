import { DynamoDBModelTransformer } from 'graphql-dynamodb-transformer';
import { GraphQLTransform } from 'graphql-transformer-core';
import ValidatorTransformer from '../ValidatorTransformer';

test('Test ValidatorTransformer happy case', () => {
  const validSchema = `
    type Post @model {
        id: ID!
        title: String! @validator(type: in, arrayString: ["asd", "123"])
        createdAt: String
        updatedAt: String
    }
    `;
  const transformer = new GraphQLTransform({
    transformers: [new DynamoDBModelTransformer(), new ValidatorTransformer()]
  });
  const out = transformer.transform(validSchema);
  process.stdout.write(out.resolvers["Mutation.createPost.req.vtl"])

  expect(out).toBeDefined();
});

// test('Test ValidatorTransformer on bad field type', () => {
//   const invalidSchema = `
//   type Post @model {
//       id: ID!
//       title: String!
//       relatedPosts: [Post] @validator(name: lowercase)
//       createdAt: String
//       updatedAt: String
//   }
//   `;
//   try {
//     const transformer = new GraphQLTransform({
//       transformers: [new DynamoDBModelTransformer(), new ValidatorTransformer()]
//     });
//     const out = transformer.transform(invalidSchema);
//   } catch (e) {
//     expect(e.name).toEqual('InvalidDirectiveError');
//   }
// });
//
// test('Test ValidatorTransformer on parent without @model', () => {
//   const invalidSchema = `
//   type Post  {
//       id: ID!
//       title: String! @validator(name: lowercase)
//       relatedPosts: [Post]
//       createdAt: String
//       updatedAt: String
//   }
//   `;
//   try {
//     const transformer = new GraphQLTransform({
//       transformers: [new DynamoDBModelTransformer(), new ValidatorTransformer()]
//     });
//     const out = transformer.transform(invalidSchema);
//   } catch (e) {
//     expect(e.name).toEqual('InvalidDirectiveError');
//   }
// });
