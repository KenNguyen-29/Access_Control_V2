/** Re-exports for employee forms — prefer `@/lib/formValidation`. */
export {
  validateUserForm,
  hasUserFormErrors,
  hasFormErrors,
  isValidEmail,
  isValidVnPhone,
  normalizePhone,
  type UserFormFields,
  type UserFormFieldErrors,
} from './formValidation';
