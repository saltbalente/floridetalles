const { kv } = require("@vercel/kv");
const { randomUUID } = require("crypto");

const PRODUCTS_KEY = "products_v1";

const sendJson = (res, status, data) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(data));
};

const readBody = (req) => {
  try {
    return JSON.parse(req.body || "{}");
  } catch (_) {
    return {};
  }
};

module.exports = async (req, res) => {
  if (req.method === "GET") {
    const items = (await kv.get(PRODUCTS_KEY)) || [];
    sendJson(res, 200, { items });
    return;
  }

  if (req.method === "POST") {
    const body = readBody(req);
    const name = String(body.name || "").trim();
    if (!name) {
      sendJson(res, 400, { error: "Nombre requerido" });
      return;
    }

    const product = { ...body, id: String(body.id || randomUUID()) };
    const list = (await kv.get(PRODUCTS_KEY)) || [];
    const index = list.findIndex((entry) => entry.id === product.id);
    if (index >= 0) {
      list[index] = product;
    } else {
      list.push(product);
    }
    await kv.set(PRODUCTS_KEY, list);
    sendJson(res, 200, { item: product });
    return;
  }

  if (req.method === "DELETE") {
    const id = req.query?.id || "";
    if (!id) {
      sendJson(res, 400, { error: "Id requerido" });
      return;
    }
    const list = (await kv.get(PRODUCTS_KEY)) || [];
    const next = list.filter((entry) => entry.id !== id);
    await kv.set(PRODUCTS_KEY, next);
    sendJson(res, 200, { ok: true });
    return;
  }

  sendJson(res, 405, { error: "Método no permitido" });
};
