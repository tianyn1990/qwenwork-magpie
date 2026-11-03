import { PROVIDER_ID, GATEWAY, MODELS } from './constants.mjs'
import { discoverRuntime } from './runtime.mjs'
import { prepareQwenworkInfer } from './wasm.mjs'
import { startLogin, waitForLogin, finishLogin, getAccount, renewAuth, quotaForMagpie } from './account.mjs'
import { chatResponse } from './chat.mjs'
import { errorResponse, ProviderError, redact } from './errors.mjs'

export function createHooks(input = {}, options = {}) {
  const fetchImpl = options.fetchImpl ?? ((...args) => fetch(...args))
  const runtimeProvider = options.runtimeProvider ?? discoverRuntime
  const signer = options.signer ?? prepareQwenworkInfer
  return {
    config: async config => {
      config.provider ??= {}
      // 把内部 MODELS 转成 Magpie 供应商模型 schema，否则界面不显示模型档位。
      const models = Object.entries(MODELS).map(([id, model]) => ({
        id,
        name: model.name,
        npm: '@ai-sdk/openai-compatible',
        url: GATEWAY,
        apiId: id,
        context: model.limit?.context ?? 131072,
        input: 0,
        output: model.limit?.output ?? 8192,
        reasoning: model.reasoning ?? false,
        image: model.modalities?.input?.includes('image') ?? true,
        tool_call: model.tool_call ?? false,
        released: '',
        variants: [],
        free: false,
        rate: 0,
        cost: { input: 0, output: 0, cache: { read: 0, write: 0 } },
      }))
      config.provider[PROVIDER_ID] = {
        name: '千问办公（社区独立插件）',
        npm: '@ai-sdk/openai-compatible',
        api: GATEWAY + '/v1',
        // 这两个布尔标志让 Magpie 在供应商卡片上渲染「用量」面板与「签到」按钮。
        usage: true,
        checkin: true,
        models,
      }
    },
    auth: {
      provider: PROVIDER_ID,
      refreshLead: 5 * 60 * 1000,
      methods: [{
        type: 'oauth', label: '浏览器登录千问办公（独立授权）',
        async authorize() {
          const runtime = runtimeProvider()
          const flow = startLogin(runtime)
          return {
            url: flow.url, method: 'auto', instructions: '在浏览器登录自己的千问办公账号。授权页可能唤起官方 App；插件不读取 App 登录文件。请在 5 分钟内完成，并且不要重复打开授权链接。',
            async callback() {
              try {
                const tokens = await waitForLogin(flow, { fetchImpl, ...options.loginOptions })
                const auth = await finishLogin(flow, tokens, { fetchImpl })
                return { ...auth, type: 'success' }
              } catch (error) { return { type: 'failed', error: redact(error.message) } }
            },
          }
        },
      }],
      async refresh(auth) { return renewAuth(auth, runtimeProvider(), { fetchImpl }) },
      async usage(getAuth) {
        try {
          const auth = await getAuth()
          return quotaForMagpie(await getAccount(auth, runtimeProvider(), { fetchImpl }), auth)
        } catch (error) {
          const msg = String(error?.message || '')
          // 千问办公服务端对额度为 0 的账号直接返回英文 "the account reports no credits"。
          // 该「每日登录送积分」活动已于 2026-08-09 结束，服务端不再发放，这里降级为中文优雅提示，避免界面抛英文硬错误。
          if (/no credits|额度|credits|quota/i.test(msg)) {
            return { plan: '千问办公', balance: '剩余 0 积分（每日登录送积分活动已于 2026-08-09 结束）', windows: [{ name: '办公积分已用尽', used: 100 }], signIn: 'kept' }
          }
          return { error: redact(msg), signIn: error.status === 401 ? 'expired' : 'kept' }
        }
      },
      // 按 loomy 的做法实现「签到」：Magpie 会从 auth.checkin 自动派生 <provider>_checkin 工具（loomy 的 loomy_checkin 即此机制）。
      // 千问办公官方「每日登录送积分」活动已于 2026-08-09 结束，当前无每日发放、也无独立签到领取接口，
      // 因此这里重读账号上下文、回读积分余额，以 loomy 同款结构化 outcome 返回，让按钮/工具可点并显示当前余额。
      async checkin(getAuth) {
        const auth = await getAuth()
        if (!auth?.access) throw Object.assign(new Error('千问办公：未登录'), { signIn: 'expired' })
        let context
        try {
          context = await getAccount(auth, runtimeProvider(), { fetchImpl })
        } catch (error) {
          if (error.status === 401 || error.status === 403) throw Object.assign(new Error('千问办公登录态已失效，请重新登录'), { signIn: 'expired' })
          throw error
        }
        const quota = context.quota
        const remaining = quota?.remaining
        const balanceText = Number.isFinite(remaining) ? `${remaining.toLocaleString('en-US')} 积分` : '未知'
        const message = `千问办公「每日登录送积分」活动已于 2026-08-09 结束，当前无签到发放。登录态正常，当前余额：${balanceText}。`
        return { outcome: 'done', message }
      },
      async loader(getAuth) {
        return {
          apiKey: 'qwenwork-community-local', baseURL: GATEWAY + '/v1',
          async fetch(url, init = {}) {
            try {
              const target = new URL(url)
              if (target.origin !== GATEWAY) throw new ProviderError('拒绝向非千问办公地址发送插件请求', 400)
              if (target.pathname === '/v1/models') return Response.json({ object: 'list', data: Object.entries(MODELS).map(([id, model]) => ({ id, object: 'model', owned_by: PROVIDER_ID, name: model.name })) })
              if (target.pathname !== '/v1/chat/completions' || (init.method ?? 'POST').toUpperCase() !== 'POST') throw new ProviderError('插件仅支持 Chat Completions；请让 Magpie 完成客户端协议转换', 400)
              const text = typeof init.body === 'string' ? init.body : await new Response(init.body).text()
              if (text.length > 32 * 1024 * 1024) throw new ProviderError('请求体超过插件限制', 413)
              let request
              try { request = JSON.parse(text) } catch { throw new ProviderError('请求体不是有效 JSON', 400) }
              return await chatResponse(request, await getAuth(), runtimeProvider(), { signer, fetchImpl, signal: init.signal })
            } catch (error) {
              if (init.signal?.aborted) throw init.signal.reason
              if (error instanceof ProviderError) return errorResponse(error)
              return errorResponse(new ProviderError(redact(error.message || '千问办公连接失败'), 503, 'provider_unavailable'))
            }
          },
        }
      },
    },
  }
}
