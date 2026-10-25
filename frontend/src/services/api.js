import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || (
    import.meta.env.DEV ? 'http://localhost:5000/api' : '/api'
  ),
})

api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem('trustvault_access_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && sessionStorage.getItem('trustvault_access_token')) {
      window.dispatchEvent(new Event('trustvault:unauthorized'))
    }
    return Promise.reject(error)
  },
)

export default api
