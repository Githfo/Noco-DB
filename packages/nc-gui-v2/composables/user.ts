import {store} from 'nuxt3-store'
import {Api} from "nocodb-sdk";
import {useNuxtApp} from "#app";

export  const useUser = () =>{
  const user =  store({
    name: 'user',
    type: 'localstorage',
    value: {token: null, user : null},
    reactiveType: 'reactive',
    version: '1.0.0'
  })

  const {$api} = useNuxtApp()
  const route = useRoute()
  const router = useRouter()


  const getUser =async (args = {}) => {
    const userInfo = await $api.auth.me(args, {
      headers: {
        'xc-auth': user.value.token
      }
    })

    user.user = userInfo
  }

  const setToken =  (token) => {
    user.token = token
  }



  $api?.instance?.interceptors.request.use((config) => {
    config.headers['xc-gui'] = 'true'
    if (user?.token) {
      config.headers['xc-auth'] = user?.token
    }
    if (!config.url.endsWith('/user/me') && !config.url.endsWith('/admin/roles')) {
      // config.headers['xc-preview'] = store.state.users.previewAs
    }

    if (!config.url.endsWith('/user/me') && !config.url.endsWith('/admin/roles')) {
      if (route && route.params && route.params.shared_base_id) {
        config.headers['xc-shared-base-id'] = route.params.shared_base_id
      }
    }

    return config
  })

  // $axios.setBaseURL('http://localhost:8080')

  $api?.instance?.interceptors.response.use((response) => {
    // Return a successful response back to the calling service
    return response
  }, (error) => {
    if (error.response && error.response.data && error.response.data.msg === 'Database config not found') {
      router.replace('/project/0')
      return
    }

    // Return any error which is not due to authentication back to the calling service
    if (!error.response || error.response.status !== 401) {
      return new Promise((resolve, reject) => {
        reject(error)
      })
    }

    // Logout user if token refresh didn't work or user is disabled
    if (error.config.url === '/auth/refresh-token') {
      // todo: clear token
      // store.dispatch('users/ActSignOut')
      setToken(null)

      return new Promise((resolve, reject) => {
        reject(error)
      })
    }

    // Try request again with new token
    return $api.instance.post('/auth/refresh-token', null, {
      withCredentials: true
    })
      .then((token) => {
        // New request with new token
        const config = error.config
        config.headers['xc-auth'] = token.data.token
        user.token =  token.data.token

        return new Promise((resolve, reject) => {
          $api.instance.request(config).then((response) => {
            resolve(response)
          }).catch((error) => {
            reject(error)
          })
        })
      })
      .catch(async (error) => {
        //todo: clear token
        // await store.dispatch('users/ActSignOut')
        setToken(null)
        if (store.state.project.appInfo.firstUser) {
          router.replace('/')
        } else {
          // $toast.clear()
          // $toast.info('Token Expired. Please login again.', {
          //   position: 'bottom-center'
          // }).goAway(5000)
          router.replace('/user/authentication/signin')
        }
        return Promise.reject(error)
      })
  })


  return {user,setToken, getUser}
}




