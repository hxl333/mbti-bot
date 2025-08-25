<template>
  <div id="app">
    <div class="container">
      <!-- 头部 -->
      <div class="header">
        <h1>🧠 MBTI AI 性格分析师</h1>
        <p>通过智能对话，深入了解你的性格类型</p>
      </div>

      <!-- 聊天容器 -->
      <div class="chat-container">
        <div class="messages" ref="messagesContainer">
          <!-- 消息列表 -->
          <div 
            v-for="(message, index) in messages" 
            :key="index"
            :class="['message', message.type]"
          >
            <div v-if="message.type === 'mbti-result'" class="message-content">
              <div class="mbti-result">
                <h3>🎯 MBTI 分析结果</h3>
                <div class="mbti-type">
                  <h4>{{ message.data.mbtiType }}</h4>
                  <p>置信度: {{ Math.round(message.data.confidence * 100) }}%</p>
                </div>
                <div class="mbti-description">
                  <p>{{ message.data.description }}</p>
                </div>
                <div class="mbti-dimensions">
                  <h5>各维度分析：</h5>
                  <div v-for="(dim, key) in message.data.dimensions" :key="key" class="dimension">
                    <strong>{{ key }}:</strong> {{ dim.type }} ({{ Math.round(dim.confidence * 100) }}%) - {{ dim.reason }}
                  </div>
                </div>
                <div class="mbti-strengths">
                  <h5>💪 优势特质：</h5>
                  <ul>
                    <li v-for="strength in message.data.strengths" :key="strength">{{ strength }}</li>
                  </ul>
                </div>
                <div class="mbti-development">
                  <h5>🌱 发展建议：</h5>
                  <ul>
                    <li v-for="area in message.data.developmentAreas" :key="area">{{ area }}</li>
                  </ul>
                </div>
                <div class="mbti-career">
                  <h5>💼 职业建议：</h5>
                  <ul>
                    <li v-for="career in message.data.careerSuggestions" :key="career">{{ career }}</li>
                  </ul>
                </div>
                
                <!-- MBTI结果内的重新开始按钮 -->
                <div class="mbti-result-actions">
                  <button 
                    @click="startNewConversation" 
                    class="mbti-restart-btn"
                    :disabled="isLoading"
                  >
                    🔄 开始新的分析
                  </button>
                </div>
              </div>
            </div>
            <template v-else>
              <div v-if="message.type !== 'system'" class="message-avatar"></div>
              <div class="message-content">
                {{ message.content }}
              </div>
            </template>
          </div>

          <!-- 加载状态 -->
          <div v-if="isLoading" class="message ai">
            <div class="message-avatar"></div>
            <div class="message-content">
              <div class="loading">正在分析中...</div>
            </div>
          </div>
        </div>

        <!-- 输入区域 -->
        <div v-if="!isAnalysisComplete" class="input-container">
          <input
            v-model="inputMessage"
            @keyup.enter="sendMessage"
            :disabled="isLoading"
            placeholder="请输入你的回答..."
            type="text"
          />
          <button 
            @click="sendMessage"
            :disabled="isLoading || !inputMessage.trim()"
          >
            发送
          </button>
        </div>

        <!-- 分析完成后的操作区域 -->
        <div v-if="isAnalysisComplete" class="analysis-complete-container">
          <div class="completion-message">
            <h3>🎯 MBTI 性格分析已完成</h3>
            <p>感谢你的参与！如果想要重新分析或了解其他方面的性格特征，可以开始新的对话。</p>
          </div>
          <button 
            @click="startNewConversation"
            class="restart-analysis-btn"
            :disabled="isLoading"
          >
            <span class="btn-icon">🔄</span>
            开始新的分析
          </button>
        </div>
      </div>
    </div>

    <!-- 重新开始按钮 -->
    <button class="restart-toggle" @click="startNewConversation" title="开始新对话">
      🔄
    </button>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, nextTick, computed, watch } from 'vue'
import aiService from './services/aiService.js'

// 响应式状态
const messages = reactive([])
const inputMessage = ref('')
const isLoading = ref(false)
const messagesContainer = ref(null)
const isAnalysisComplete = ref(false)

// 计算属性 - 检查是否可以发送消息
const canSendMessage = computed(() => {
  return !isLoading.value && inputMessage.value.trim().length > 0
})

// 计算属性 - 消息统计
const messageStats = computed(() => {
  const userMessages = messages.filter(msg => msg.type === 'user').length
  const aiMessages = messages.filter(msg => msg.type === 'ai').length
  return { userMessages, aiMessages }
})

// 监听消息变化，自动滚动
watch(messages, () => {
  scrollToBottom()
}, { deep: true })

// 滚动到底部
const scrollToBottom = async () => {
  await nextTick()
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
  }
}

// 添加消息
const addMessage = (content, type = 'user') => {
  messages.push({
    id: Date.now() + Math.random(), // 添加唯一ID
    content,
    type,
    timestamp: new Date()
  })
}

// 添加MBTI结果消息
const addMBTIResult = (analysisData) => {
  messages.push({
    id: Date.now() + Math.random(),
    type: 'mbti-result',
    data: analysisData,
    timestamp: new Date()
  })
}

// 发送消息
const sendMessage = async () => {
  if (!canSendMessage.value) {
    return
  }

  const userMessage = inputMessage.value.trim()
  addMessage(userMessage, 'user')
  inputMessage.value = ''
  isLoading.value = true

  try {
    const response = await aiService.sendMessage(userMessage)
    
    // 添加AI回复
    addMessage(response.message, 'ai')
    
    // 如果有分析结果，添加MBTI结果
    if (response.analysis && !response.analysis.error) {
      addMBTIResult(response.analysis)
      addMessage('🎉 分析完成！希望这个结果对你有帮助。', 'system')
      isAnalysisComplete.value = true
    }
    
  } catch (error) {
    console.error('发送消息失败:', error)
    addMessage(`❌ 发送失败: ${error.message}`, 'system')
  } finally {
    isLoading.value = false
  }
}

// 开始新对话
const startNewConversation = async () => {
  // 清空消息
  messages.splice(0, messages.length)
  aiService.resetConversation()
  isAnalysisComplete.value = false
  isLoading.value = true

  try {
    const welcomeMessage = await aiService.getWelcomeMessage()
    addMessage(welcomeMessage, 'ai')
  } catch (error) {
    console.error('获取欢迎消息失败:', error)
    addMessage('❌ 初始化对话失败，请检查网络连接和API配置', 'system')
  } finally {
    isLoading.value = false
  }
}

// 初始化应用
const initializeApp = async () => {
  isAnalysisComplete.value = false
  
  if (aiService.isModelReady.value) {
    addMessage('👋 欢迎使用 MBTI AI 性格分析师！', 'system')
    // 延迟启动对话，提供更好的用户体验
    setTimeout(startNewConversation, 500)
  } else {
    addMessage('⚠️ DeepSeek AI模型未配置，请在 src/config/config.js 中设置你的API Key', 'system')
  }
}

// 组件挂载时初始化
onMounted(() => {
  initializeApp()
})
</script> 