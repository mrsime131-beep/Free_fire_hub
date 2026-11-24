import { ZodError } from "zod";
import { ApiError } from "../utils/apiResponse.js";

/**
 * Zod Input Validation Middleware
 * প্রতিটি API রিকোয়েস্টের req.body, req.query এবং req.params কঠোরভাবে যাচাই ও স্যানিটাইজ করে।
 *
 * দুইভাবে ব্যবহার করা যাবে:
 * 1) validate({ body: bodySchema, query: querySchema, params: paramsSchema })
 * 2) validate(singleZodObjectSchema) -> যেখানে স্কিমাটি সরাসরি req.body ভ্যালিডেট করবে
 */
export function validate(schemaConfig) {
  return async (req, res, next) => {
    try {
      if (!schemaConfig) {
        return next();
      }

      // যদি সরাসরি একটি Zod Schema পাস করা হয় (যেমন: validate(createOrderSchema))
      if (typeof schemaConfig.parseAsync === "function") {
        req.body = await schemaConfig.parseAsync(req.body);
        return next();
      }

      // যদি { body, query, params } অবজেক্ট আকারে আলাদা স্কিমা পাস করা হয়
      if (schemaConfig.body) {
        req.body = await schemaConfig.body.parseAsync(req.body);
      }

      if (schemaConfig.query) {
        const parsedQuery = await schemaConfig.query.parseAsync(req.query);
        req.validatedQuery = parsedQuery;
        Object.assign(req.query, parsedQuery);
      }

      if (schemaConfig.params) {
        const parsedParams = await schemaConfig.params.parseAsync(req.params);
        req.validatedParams = parsedParams;
        Object.assign(req.params, parsedParams);
      }

      return next();
    } catch (error) {
      if (error instanceof ZodError) {
        const formattedErrors = error.errors.map((issue) => ({
          field: issue.path.join(".") || "input",
          message: issue.message,
        }));

        const firstErrorMessage =
          formattedErrors[0]?.message ||
          "Invalid input data provided. Please check your form fields.";

        return next(
          new ApiError(
            400,
            firstErrorMessage,
            formattedErrors,
            "VALIDATION_ERROR"
          )
        );
      }

      return next(error);
    }
  };
}
