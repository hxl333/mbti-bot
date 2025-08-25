// DeepSeek API 配置
export const AI_CONFIG = {
  // DeepSeek API 配置 - 优先使用环境变量
  apiKey: import.meta.env.VITE_DEEPSEEK_API_KEY || "sk-e8b3281ceb4e465598c10a222d2df03f", // 从环境变量读取或使用默认值
  baseURL: "https://api.deepseek.com", // DeepSeek API 基础URL
  model: "deepseek-chat", // 使用的模型名称

  // 模型参数配置
  temperature: 0.7,
  maxTokens: 2000,

  // MBTI分析配置
  minQuestionsBeforeAnalysis: 4, // 最少问题数量后才能进行分析
  analysisKeywords: [
    "分析",
    "总结",
    "结论",
    "性格类型",
    "MBTI",
    "判断",
    "评估",
    "看起来",
    "根据",
    "综合",
  ],
};

// 验证配置
export const validateConfig = () => {
  if (!AI_CONFIG.apiKey) {
    console.warn("⚠️ 请配置 VITE_DEEPSEEK_API_KEY 环境变量或在 config.js 中设置 API Key");
    return false;
  }
  return true;
};
