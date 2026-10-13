import axios from 'axios';

export const client = axios.create({
  baseURL: '/api/v1',
});

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('fet_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

client.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && !location.pathname.startsWith('/login')) {
      localStorage.removeItem('fet_token');
      location.href = '/login';
    }
    return Promise.reject(err);
  },
);

export const errMessage = (e: unknown): string =>
  axios.isAxiosError(e) ? (e.response?.data?.message ?? e.message) : 'Something went wrong';
