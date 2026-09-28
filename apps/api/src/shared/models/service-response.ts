export class ServiceResponse<T = null> {
  readonly success: boolean;
  readonly statusCode: number;
  readonly message: string;
  readonly data: T;

  private constructor(success: boolean, statusCode: number, message: string, data: T) {
    this.success = success;
    this.statusCode = statusCode;
    this.message = message;
    this.data = data;
  }

  static success<T>(data: T, message = "Success", statusCode = 200) {
    return new ServiceResponse(true, statusCode, message, data);
  }

  static created<T>(data: T, message = "Created") {
    return new ServiceResponse(true, 201, message, data);
  }
}
