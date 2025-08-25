import { ChatOpenAI } from '@langchain/openai'
import { HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages'
import { AI_CONFIG, validateConfig } from '../config/config.js'
import { ref, reactive, computed } from 'vue'

// 响应式状态
const chatModel = ref(null)
const conversationHistory = reactive([])
const isAnalyzing = ref(false)
const isInitialized = ref(false)

// 用户信息状态
const userInfo = reactive({
  mbtiType: null,
  traits: {},
  questionsAsked: 0,
  collectedData: {}
})

// 计算属性 - 检查模型是否准备就绪
const isModelReady = computed(() => {
  return isInitialized.value && chatModel.value !== null
})

// 计算属性 - 获取问题进度提示
const progressHint = computed(() => {
  const questionsAsked = userInfo.questionsAsked
  return questionsAsked >= AI_CONFIG.minQuestionsBeforeAnalysis 
    ? '你已经收集了足够的基础信息，可以考虑进行深入分析了。'
    : `你已经问了${questionsAsked}个问题，还需要更多信息来进行准确分析。`
})

// 初始化DeepSeek模型
const initializeDeepSeekModel = () => {
  try {
    if (!validateConfig()) {
      console.error('❌ DeepSeek API配置无效，请检查config.js文件')
      return false
    }

    chatModel.value = new ChatOpenAI({
      openAIApiKey: AI_CONFIG.apiKey,
      configuration: {
        baseURL: AI_CONFIG.baseURL,
      },
      modelName: AI_CONFIG.model,
      temperature: AI_CONFIG.temperature,
      maxTokens: AI_CONFIG.maxTokens
    })
    
    isInitialized.value = true
    console.log('✅ DeepSeek AI模型初始化成功')
    return true
  } catch (error) {
    console.error('❌ 初始化DeepSeek模型失败:', error)
    isInitialized.value = false
    return false
  }
}

// 获取系统提示词
const getSystemPrompt = () => {
  return `你是一个专业的MBTI性格分析师。你的任务是通过与用户对话来分析他们的MBTI性格类型。

MBTI包含四个维度：
1. 外向(E) vs 内向(I) - 能量来源和社交偏好
2. 感觉(S) vs 直觉(N) - 信息收集和处理方式  
3. 思考(T) vs 情感(F) - 决策和判断方式
4. 判断(J) vs 知觉(P) - 生活方式和工作风格

请遵循以下规则：
1. 用友好、专业的语调与用户交流
2. 每次只问1-2个相关问题，不要一次问太多
3. 根据用户的回答逐步收集各个维度的信息
4. 问题要具体且贴近生活场景，避免抽象概念
5. 避免直接问"你是内向还是外向"这样的问题，要通过具体情境来判断
6. 当你认为收集到足够的信息时（通常5-8个问题后），在回复中包含"分析"、"总结"或"结论"等关键词来触发详细分析

当前进度：${progressHint.value}

重要提示：如果你认为已经收集到足够信息进行MBTI分析，请在回复中明确提到要进行"分析"或给出"结论"。`
}

// 发送消息给AI
const sendMessage = async (userMessage) => {
  if (!isModelReady.value) {
    throw new Error('DeepSeek AI模型未初始化，请检查配置文件')
  }

  try {
    // 添加用户消息到历史
    conversationHistory.push(new HumanMessage(userMessage))

    // 构建消息数组
    const messages = [
      new SystemMessage(getSystemPrompt()),
      ...conversationHistory
    ]

    // 发送到AI模型
    const response = await chatModel.value.invoke(messages)
    
    // 添加AI回复到历史
    conversationHistory.push(new AIMessage(response.content))
    
    // 更新问题计数
    userInfo.questionsAsked++

    // 检查是否需要进行分析
    if (shouldAnalyze(response.content)) {
      const analysis = await performMBTIAnalysis()
      return {
        message: response.content,
        analysis: analysis,
        isComplete: true
      }
    }

    return {
      message: response.content,
      analysis: null,
      isComplete: false
    }

  } catch (error) {
    console.error('AI请求失败:', error)
    throw new Error(`AI请求失败: ${error.message}`)
  }
}

// 判断是否应该进行MBTI分析
const shouldAnalyze = (aiResponse) => {
  // 检查是否达到最少问题数量
  const hasEnoughQuestions = userInfo.questionsAsked >= AI_CONFIG.minQuestionsBeforeAnalysis
  
  // 检查AI是否表达了分析意图
  const hasAnalysisIntent = AI_CONFIG.analysisKeywords.some(keyword => 
    aiResponse.includes(keyword)
  )
  
  // 检查是否收集到足够的维度信息
  const hasEnoughInfo = hasCollectedEnoughDimensionInfo()
  
  console.log('分析条件检查:', {
    questionsAsked: userInfo.questionsAsked,
    hasEnoughQuestions,
    hasAnalysisIntent,
    hasEnoughInfo,
    aiResponse: aiResponse.substring(0, 100) + '...'
  })
  
  return hasEnoughQuestions && (hasAnalysisIntent || hasEnoughInfo)
}

// 检查是否收集到足够的维度信息
const hasCollectedEnoughDimensionInfo = () => {
  const conversationText = conversationHistory
    .map(msg => msg.content)
    .join(' ')
    .toLowerCase()

  // 检查是否涉及各个维度的关键词
  const dimensionKeywords = {
    EI: ['聚会', '社交', '独处', '交流', '朋友', '人群', '安静', '热闹'],
    SN: ['细节', '直觉', '可能性', '未来', '现实', '抽象', '具体', '想象'],
    TF: ['决定', '感受', '逻辑', '情感', '理性', '价值观', '公平', '和谐'],
    JP: ['计划', '灵活', '规律', '随性', '截止日期', '自由', '结构', '变化']
  }

  let coveredDimensions = 0
  for (const [dimension, keywords] of Object.entries(dimensionKeywords)) {
    const hasDimensionInfo = keywords.some(keyword => 
      conversationText.includes(keyword)
    )
    if (hasDimensionInfo) {
      coveredDimensions++
    }
  }

  // 如果覆盖了至少3个维度，认为信息充足
  return coveredDimensions >= 3
}

// 执行MBTI分析
const performMBTIAnalysis = async () => {
  if (isAnalyzing.value) return null
  isAnalyzing.value = true

  try {
    const analysisPrompt = `作为专业的MBTI性格分析师，请基于以下对话历史，对用户进行深入的MBTI性格类型分析。

对话历史：
${conversationHistory.map(msg => 
  `${msg instanceof HumanMessage ? '用户' : 'AI'}: ${msg.content}`
).join('\n')}

请进行详细分析，并严格按照以下JSON格式输出结果。每个字段都必须填写完整：

{
  "mbtiType": "ENFP",
  "confidence": 0.85,
  "dimensions": {
    "EI": {
      "type": "E",
      "confidence": 0.8,
      "reason": "从用户的回答中可以看出，用户更倾向于从外部世界获取能量，喜欢与人交流互动，在社交场合表现活跃。例如用户提到..."
    },
    "SN": {
      "type": "N", 
      "confidence": 0.9,
      "reason": "用户在描述问题时更关注可能性和未来潜力，而不是具体细节，显示出直觉型的特征。比如用户说..."
    },
    "TF": {
      "type": "F",
      "confidence": 0.7,
      "reason": "在做决定时，用户更多考虑人际关系和价值观，而非纯粹的逻辑分析，表现出情感型决策风格。体现在..."
    },
    "JP": {
      "type": "P",
      "confidence": 0.8,
      "reason": "用户更喜欢保持灵活性和开放性，不喜欢过于严格的计划和结构，偏好知觉型的生活方式。这在...中有所体现"
    }
  },
  "description": "ENFP类型（倡导者）是充满热情和创造力的人。他们外向、直觉、情感和知觉的特质使他们成为天生的激励者和创新者。他们善于发现人和事物的潜力，能够激发他人的积极性。ENFP类型的人通常很有魅力，能够与各种类型的人建立良好关系。他们重视个人价值观，追求意义和可能性。",
  "strengths": [
    "富有创造力和想象力，能够提出新颖的想法和解决方案",
    "出色的人际交往能力，善于激励和影响他人",
    "适应性强，能够在变化的环境中保持灵活性",
    "对他人的需求和情感非常敏感，具有强烈的同理心",
    "热情洋溢，能够为团队带来积极的能量"
  ],
  "developmentAreas": [
    "提高专注力，避免同时进行太多项目而导致效率降低",
    "加强细节管理能力，确保重要任务的完成质量",
    "学会更好地处理批评，不要过于情绪化地回应负面反馈",
    "培养长期规划能力，平衡即兴决策与系统性思考"
  ],
  "careerSuggestions": [
    "创意行业：广告策划、平面设计师、内容创作者、艺术指导",
    "教育培训：培训师、教育顾问、课程开发专员、学生辅导员",
    "人力资源：HR专员、组织发展顾问、员工关系专家、招聘专员",
    "媒体传播：记者、公关专员、社交媒体经理、品牌策划",
    "咨询服务：管理咨询师、心理咨询师、职业规划师、创业顾问"
  ]
}

重要提示：
1. 必须基于对话内容进行分析，不要编造信息
2. 每个维度的reason字段必须引用具体的对话内容
3. 置信度要根据对话信息的充分程度来判断
4. 描述要针对分析出的具体类型，不要使用模板化内容
5. 输出必须是有效的JSON格式，不要添加任何其他文字`

    const analysisMessages = [
      new SystemMessage(`你是资深的MBTI性格分析专家，拥有丰富的心理学背景。请仔细分析用户的对话内容，从以下四个维度进行评估：
1. 外向(E) vs 内向(I)：分析用户的能量来源和社交偏好
2. 感觉(S) vs 直觉(N)：分析用户的信息处理方式
3. 思考(T) vs 情感(F)：分析用户的决策风格
4. 判断(J) vs 知觉(P)：分析用户的生活方式偏好

请确保分析结果详细、准确，并且输出格式严格符合要求。`),
      new HumanMessage(analysisPrompt)
    ]

    const analysisResponse = await chatModel.value.invoke(analysisMessages)
    console.log('AI分析原始回复:', analysisResponse.content)
    
    // 尝试解析JSON结果
    const analysis = parseAnalysisResult(analysisResponse.content)
    if (analysis && analysis.mbtiType) {
      userInfo.mbtiType = analysis.mbtiType
      return analysis
    }
    
    throw new Error('无法解析分析结果')

  } catch (error) {
    console.error('MBTI分析失败:', error)
    // 返回一个基本的分析结果作为后备
    return generateFallbackAnalysis()
  } finally {
    isAnalyzing.value = false
  }
}

// 解析分析结果
const parseAnalysisResult = (content) => {
  try {
    // 尝试提取JSON内容
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const analysis = JSON.parse(jsonMatch[0])
      
      // 验证必要字段
      if (analysis.mbtiType && analysis.dimensions && analysis.description) {
        return analysis
      }
    }
    
    // 如果标准JSON解析失败，尝试其他方法
    return parseAlternativeFormat(content)
    
  } catch (error) {
    console.error('JSON解析失败:', error)
    return null
  }
}

// 解析其他格式的回复
const parseAlternativeFormat = (content) => {
  try {
    // 如果AI返回了简单的键值对格式，尝试解析
    const lines = content.split('\n')
    const result = {
      mbtiType: '',
      confidence: 0.75,
      dimensions: {},
      description: '',
      strengths: [],
      developmentAreas: [],
      careerSuggestions: []
    }
    
    // 尝试从内容中提取MBTI类型
    for (const line of lines) {
      if (line.includes('mbtiType') || line.includes('类型')) {
        const match = line.match(/[A-Z]{4}/)
        if (match) {
          result.mbtiType = match[0]
          break
        }
      }
    }
    
    if (result.mbtiType) {
      // 基于类型生成基本分析
      return generateBasicAnalysis(result.mbtiType)
    }
    
    return null
  } catch (error) {
    console.error('替代格式解析失败:', error)
    return null
  }
}

// 生成基本分析（当AI返回不完整时使用）
const generateBasicAnalysis = (mbtiType) => {
  const typeDescriptions = {
    'ENFP': {
      description: 'ENFP（倡导者）是充满热情和创造力的理想主义者，善于激励他人并发现新的可能性。',
      strengths: ['富有创造力', '善于激励他人', '适应性强', '充满热情'],
      developmentAreas: ['提高专注力', '加强细节管理', '学会处理批评'],
      careerSuggestions: ['创意设计', '教育培训', '人力资源', '媒体传播']
    },
    'INTJ': {
      description: 'INTJ（建筑师）是独立的思想家，具有强烈的直觉和战略思维能力。',
      strengths: ['战略思维', '独立工作', '系统性思考', '目标导向'],
      developmentAreas: ['改善人际交往', '增强灵活性', '学会团队合作'],
      careerSuggestions: ['系统分析', '研究开发', '战略规划', '技术管理']
    }
    // 可以添加更多类型...
  }

  const typeInfo = typeDescriptions[mbtiType] || typeDescriptions['ENFP']
  
  return {
    mbtiType: mbtiType,
    confidence: 0.7,
    dimensions: generateDimensionsAnalysis(mbtiType),
    description: typeInfo.description,
    strengths: typeInfo.strengths,
    developmentAreas: typeInfo.developmentAreas,
    careerSuggestions: typeInfo.careerSuggestions
  }
}

// 生成维度分析
const generateDimensionsAnalysis = (mbtiType) => {
  const dimensions = {}
  const chars = mbtiType.split('')
  
  dimensions.EI = {
    type: chars[0],
    confidence: 0.75,
    reason: `基于对话分析，用户表现出${chars[0] === 'E' ? '外向' : '内向'}的特征`
  }
  
  dimensions.SN = {
    type: chars[1],
    confidence: 0.75,
    reason: `用户在信息处理上偏向${chars[1] === 'S' ? '感觉' : '直觉'}型`
  }
  
  dimensions.TF = {
    type: chars[2],
    confidence: 0.75,
    reason: `决策风格倾向于${chars[2] === 'T' ? '理性思考' : '情感考虑'}`
  }
  
  dimensions.JP = {
    type: chars[3],
    confidence: 0.75,
    reason: `生活方式更偏向${chars[3] === 'J' ? '有序规划' : '灵活适应'}`
  }
  
  return dimensions
}

// 生成后备分析结果
const generateFallbackAnalysis = () => {
  return {
    mbtiType: 'ENFP',
    confidence: 0.6,
    dimensions: {
      EI: { type: 'E', confidence: 0.6, reason: '基于有限的对话信息推测用户偏向外向' },
      SN: { type: 'N', confidence: 0.6, reason: '用户表现出一定的直觉型特征' },
      TF: { type: 'F', confidence: 0.6, reason: '决策时似乎更重视人际关系和情感因素' },
      JP: { type: 'P', confidence: 0.6, reason: '表现出较强的灵活性和开放性' }
    },
    description: '基于有限的对话信息，初步分析显示用户可能属于ENFP类型。建议进行更深入的对话以获得更准确的分析结果。',
    strengths: ['善于交流', '富有创意', '适应性强', '关心他人'],
    developmentAreas: ['需要更多信息来准确评估发展领域'],
    careerSuggestions: ['建议进行更详细的对话以提供准确的职业建议']
  }
}

// 获取初始欢迎消息
const getWelcomeMessage = async () => {
  if (!isModelReady.value) {
    return '⚠️ DeepSeek AI模型未准备就绪，请检查配置文件中的API Key设置'
  }

  try {
    const welcomePrompt = new SystemMessage(getSystemPrompt() + '\n\n请开始介绍自己并提出第一个问题。')
    const response = await chatModel.value.invoke([welcomePrompt])
    
    conversationHistory.push(new AIMessage(response.content))
    
    return response.content
  } catch (error) {
    console.error('获取欢迎消息失败:', error)
    return '你好！我是你的MBTI性格分析师。让我们开始了解你的性格特点吧！请告诉我，在一个聚会上，你通常更愿意与几个熟悉的朋友深入交谈，还是喜欢认识更多新朋友？'
  }
}

// 重置对话
const resetConversation = () => {
  conversationHistory.splice(0, conversationHistory.length)
  Object.assign(userInfo, {
    mbtiType: null,
    traits: {},
    questionsAsked: 0,
    collectedData: {}
  })
  isAnalyzing.value = false
}

// 获取对话历史
const getConversationHistory = () => {
  return conversationHistory
}

// 获取用户信息
const getUserInfo = () => {
  return userInfo
}

// 自动初始化DeepSeek模型
initializeDeepSeekModel()

// 导出API
export default {
  // 响应式状态
  isModelReady,
  isAnalyzing,
  userInfo,
  conversationHistory,
  
  // 方法
  sendMessage,
  getWelcomeMessage,
  resetConversation,
  getConversationHistory,
  getUserInfo,
  initializeDeepSeekModel
} 