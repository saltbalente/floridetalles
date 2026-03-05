const { kv } = require("@vercel/kv");
const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");

const INVENTORY_KEY = "inventory_custom_v1";
const DELETED_KEY = "inventory_deleted_v1";

const parseCsvNumber = (value) => {
  if (!value) return 0;
  const cleaned = value.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
};

const parseInventoryCsv = (text) => {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length <= 1) return [];
  const items = [];
  for (let i = 1; i < lines.length; i += 1) {
    const parts = lines[i].split(";");
    const name = (parts[0] || "").trim();
    if (!name) continue;
    items.push({
      name,
      type: (parts[1] || "").trim(),
      presentation: (parts[2] || "").trim(),
      packQty: parseCsvNumber(parts[3]),
      unitMeasure: (parts[4] || "").trim(),
      purchasePrice: parseCsvNumber(parts[5])
    });
  }
  return items;
};

const readCsvInventory = () => {
  try {
    const csvPath = path.join(process.cwd(), "INVENTARIO Y COSTOS-Tabla 1.csv");
    const text = fs.readFileSync(csvPath, "utf-8");
    return parseInventoryCsv(text);
  } catch (_) {
    return [];
  }
};

const sendJson = (res, status, data) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(data));
};

module.exports = async (req, res) => {
  if (req.method === "GET") {
    const base = readCsvInventory();
    const custom = (await kv.get(INVENTORY_KEY)) || [];
    const deleted = (await kv.get(DELETED_KEY)) || [];
    const filtered = base.concat(custom).filter(
      (item) => !deleted.some((name) => String(name).toLowerCase() === String(item.name || "").toLowerCase())
    );
    sendJson(res, 200, { items: filtered });
    return;
  }

  if (req.method === "POST") {
    let body = {};
    try {
      body = JSON.parse(req.body || "{}");
    } catch (_) {
      body = {};
    }

    const name = String(body.name || "").trim();
    if (!name) {
      sendJson(res, 400, { error: "Nombre requerido" });
      return;
    }

    const item = {
      id: String(body.id || randomUUID()),
      name,
      type: String(body.type || "").trim(),
      presentation: String(body.presentation || "").trim(),
      packQty: Number(body.packQty) || 0,
      unitMeasure: String(body.unitMeasure || "").trim(),
      purchasePrice: Number(body.purchasePrice) || 0
    };

    const list = (await kv.get(INVENTORY_KEY)) || [];
    const index = list.findIndex((entry) => String(entry.name || "").toLowerCase() === name.toLowerCase());
    if (index >= 0) {
      list[index] = { ...list[index], ...item, id: list[index].id || item.id };
    } else {
      list.push(item);
    }
    await kv.set(INVENTORY_KEY, list);
    const deleted = (await kv.get(DELETED_KEY)) || [];
    const nextDeleted = deleted.filter((entry) => String(entry).toLowerCase() !== name.toLowerCase());
    await kv.set(DELETED_KEY, nextDeleted);
    sendJson(res, 200, { item });
    return;
  }

  if (req.method === "DELETE") {
    const name = String(req.query?.name || "").trim();
    if (!name) {
      sendJson(res, 400, { error: "Nombre requerido" });
      return;
    }
    const list = (await kv.get(INVENTORY_KEY)) || [];
    const filtered = list.filter((entry) => String(entry.name || "").toLowerCase() !== name.toLowerCase());
    await kv.set(INVENTORY_KEY, filtered);
    const deleted = (await kv.get(DELETED_KEY)) || [];
    if (!deleted.some((entry) => String(entry).toLowerCase() === name.toLowerCase())) {
      deleted.push(name);
      await kv.set(DELETED_KEY, deleted);
    }
    sendJson(res, 200, { ok: true });
    return;
  }

  sendJson(res, 405, { error: "Método no permitido" });
};
