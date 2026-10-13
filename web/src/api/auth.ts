import { client } from './client';
import type { AuthResponse } from '../types';

export const login = (email: string, password: string) =>
  client.post<AuthResponse>('/auth/login', { email, password }).then((r) => r.data);

export const register = (name: string, email: string, password: string) =>
  client.post<AuthResponse>('/auth/register', { name, email, password }).then((r) => r.data);

export const acceptInvite = (token: string, name: string, password: string) =>
  client.post<AuthResponse>('/auth/accept-invite', { token, name, password }).then((r) => r.data);

export const forgotPassword = (email: string) =>
  client.post<{ ok: boolean; message: string; resetUrl?: string }>('/auth/forgot-password', { email }).then((r) => r.data);

export const resetPassword = (token: string, password: string) =>
  client.post<{ ok: boolean }>('/auth/reset-password', { token, password }).then((r) => r.data);
