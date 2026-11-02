export const integerValidator = {
    validator: Number.isInteger,
    message: '{PATH} must be an integer',
  };
  
  export const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;