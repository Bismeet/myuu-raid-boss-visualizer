import { calculateBattleRaidDamage, safeErrorDetails } from "./_private/raid-calculator.js";

function parseBody(request) {
  if (request.body && typeof request.body === "object") return request.body;
  if (typeof request.body === "string") return JSON.parse(request.body);
  return {};
}

export default async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "application/json; charset=utf-8");

  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Method not allowed" });
  }

  try {
    const result = await calculateBattleRaidDamage(parseBody(request));
    return response.status(200).json(result);
  } catch (error) {
    const unavailable = error?.message === "SERVER_CONFIG_UNAVAILABLE";
    console.error("[battle-damage api] request failed", safeErrorDetails(error));
    return response.status(unavailable ? 503 : 400).json({
      error: unavailable ? "Server calculation unavailable" : "Unable to calculate damage",
    });
  }
}
