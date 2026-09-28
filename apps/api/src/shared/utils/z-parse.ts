import type { Request } from "express";
import { ZodError, type ZodType, type z } from "zod";
import { ApiError, type FieldError } from "@/shared/errors/api-error";

export const toFieldErrors = (error: ZodError): FieldError[] =>
  error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));

/**
 * Validates the parts of a request a route reads and returns the parsed value.
 * Handlers use what this returns, never req.body, so every default and transform
 * a schema applies reaches the domain.
 *
 * @throws ApiError 400 VALIDATION_ERROR naming each field that failed.
 */
export const zParse = async <T extends ZodType>(
  schema: T,
  req: Request,
): Promise<z.infer<T>> => {
  try {
    return await schema.parseAsync({
      // Express 5 leaves body undefined when a request carries none. Schemas are
      // written against an empty object, so a bodiless PUT still validates.
      body: req.body ?? {},
      query: req.query,
      params: req.params,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      const details = toFieldErrors(error);
      const message = details
        .map((field) => `${field.path}: ${field.message}`)
        .join(", ");
      throw ApiError.validation(`Validation error: ${message}`, details);
    }
    throw error;
  }
};
