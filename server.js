import express from "express";
import fetch from "node-fetch";
import bodyParser from "body-parser";

const app = express();
app.use(bodyParser.json());

// 🔐 OpenAI API Key (ENV ONLY – REQUIRED)
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY environment variable not set");
}

// 🧠 Unlimited Triggers (Meesho config karega)
const TRIGGERS = [
  {
    name: "order_cancel",
    reply:
      "Your order was cancelled due to a system update. Refund will be processed within 3–5 working days.",
    risk: false
  },
  {
    name: "refund_delay",
    reply:
      "We understand your concern. Refunds usually take 5–7 working days depending on your bank.",
    risk: false
  },
  {
    name: "legal_threat",
    reply:
      "Your concern has been escalated to our senior support team.",
    risk: true
  }
];

// 🧠 AI Meaning + Risk Analyzer
async function analyzeMessage(message) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `
You are a customer support AI.
Understand the meaning of the message.
Classify it into one of these intents:
order_cancel, refund_delay, legal_threat, unknown.
Also detect legal / compliance risk.
Return ONLY JSON like:
{ "intent": "...", "risk": true/false }
`
        },
        {
          role: "user",
          content: message
        }
      ]
    })
  });

  const data = await res.json();
  return JSON.parse(data.choices[0].message.content);
}

// ⚙️ Trigger Selector
function selectTrigger(intent) {
  return TRIGGERS.find(t => t.name === intent) || null;
}

// 🌐 WEBHOOK (Meesho backend yahin hit karega)
app.post("/webhook/meesho", async (req, res) => {
  const { message } = req.body;

  if (!message) {
    return res.status(400).json({ error: "message missing" });
  }

  try {
    const analysis = await analyzeMessage(message);
    const trigger = selectTrigger(analysis.intent);

    if (!trigger) {
      return res.json({
        status: "no_match",
        action: "send_to_human"
      });
    }

    if (analysis.risk || trigger.risk) {
      return res.json({
        status: "risk_detected",
        action: "human_approval_required",
        suggested_reply: trigger.reply
      });
    }

    // ✅ Auto reply
    return res.json({
      status: "auto_replied",
      reply: trigger.reply
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "AI processing failed" });
  }
});

// 🚀 Server Start
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Automation live on port ${PORT}`);
});
