import { onRequestGet as __api_chat_js_onRequestGet } from "D:\\cradis\\Ai\\Ai-Interview-Agent\\functions\\api\\chat.js"
import { onRequestPost as __api_chat_js_onRequestPost } from "D:\\cradis\\Ai\\Ai-Interview-Agent\\functions\\api\\chat.js"
import { onRequest as ___middleware_js_onRequest } from "D:\\cradis\\Ai\\Ai-Interview-Agent\\functions\\_middleware.js"

export const routes = [
    {
      routePath: "/api/chat",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_chat_js_onRequestGet],
    },
  {
      routePath: "/api/chat",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_chat_js_onRequestPost],
    },
  {
      routePath: "/",
      mountPath: "/",
      method: "",
      middlewares: [___middleware_js_onRequest],
      modules: [],
    },
  ]