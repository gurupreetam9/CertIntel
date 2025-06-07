import { z } from 'zod';

export const SignUpSchema = z.object({
  email: z.string().email({ message: 'Invalid email address.' }),
  password: z.string().min(6, { message: 'Password must be at least 6 characters.' }),
});
export type SignUpFormValues = z.infer<typeof SignUpSchema>;

export const SignInSchema = z.object({
  email: z.string().email({ message: 'Invalid email address.' }),
  password: z.string().min(1, { message: 'Password is required.' }),
});
export type SignInFormValues = z.infer<typeof SignInSchema>;
