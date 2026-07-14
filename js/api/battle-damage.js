const EXPECTED_ROLLS = 16;

function validRolls(value) {
  return Array.isArray(value)
    && value.length === EXPECTED_ROLLS
    && value.every((roll) => Number.isInteger(roll) && roll >= 0);
}

export async function requestBattleDamage(payload) {
  const response = await fetch("/api/battle-damage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !validRolls(data.rolls) || !validRolls(data.myuuRolls)) {
    throw new Error(data.error || "Private battle calculation unavailable");
  }
  if (!Number.isFinite(data.effectiveness) || !Number.isInteger(data.myuuAverage) || data.myuuAverage < 0) {
    throw new Error("Private battle calculation returned an invalid result");
  }
  return {
    rolls: data.rolls,
    myuuRolls: data.myuuRolls,
    myuuAverage: data.myuuAverage,
    effectiveness: data.effectiveness,
  };
}
