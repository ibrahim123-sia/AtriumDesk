// Create a new chat
export const createChat = async (req, res) => {
  try {
    const userId = req.user._id;
    const { name, type } = req.body;

    const chatData = {
      userId,
      messages: [],
      name: name || "New Chat",
      userName: req.user.name,
    };
    
    const chat = await req.models.Chat.create(chatData);
    
    res.json({ 
      success: true, 
      message: "Chat Created",
      chat: {
        _id: chat._id,
        name: chat.name,
        messages: chat.messages,
        createdAt: chat.createdAt,
        updatedAt: chat.updatedAt
      }
    });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
};

// Get all chats for user
export const getChats = async (req, res) => {
  try {
    const userId = req.user._id;
    const chats = await req.models.Chat.find({ userId })
      .sort({ updatedAt: -1 })
      .select('_id name messages createdAt updatedAt');

    res.json({ success: true, chats });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
};

// Get single chat by ID
export const getChatById = async (req, res) => {
  try {
    const userId = req.user._id;
    const { chatId } = req.params;

    const chat = await req.models.Chat.findOne({ _id: chatId, userId });
    if (!chat) {
      return res.status(404).json({ 
        success: false, 
        message: "Chat not found" 
      });
    }

    res.json({ success: true, chat });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
};

// Delete chat
export const deleteChat = async (req, res) => {
  try {
    const userId = req.user._id;
    const { chatId } = req.body;

    const result = await req.models.Chat.deleteOne({ _id: chatId, userId });
    
    if (result.deletedCount === 0) {
      return res.status(404).json({ 
        success: false, 
        message: "Chat not found" 
      });
    }

    res.json({ success: true, message: "Chat deleted" });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
};

// Update chat name
export const updateChatName = async (req, res) => {
  try {
    const userId = req.user._id;
    const { chatId, name } = req.body;

    if (!name || name.trim() === '') {
      return res.status(400).json({ 
        success: false, 
        message: "Chat name is required" 
      });
    }

    const chat = await req.models.Chat.findOneAndUpdate(
      { _id: chatId, userId },
      { name: name.trim() },
      { new: true, runValidators: true }
    );

    if (!chat) {
      return res.status(404).json({ 
        success: false, 
        message: "Chat not found" 
      });
    }

    res.json({ 
      success: true, 
      message: "Chat name updated",
      chat: { _id: chat._id, name: chat.name }
    });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
};

// Clear all messages in a chat (keep chat record)
export const clearChatMessages = async (req, res) => {
  try {
    const userId = req.user._id;
    const { chatId } = req.body;

    const chat = await req.models.Chat.findOneAndUpdate(
      { _id: chatId, userId },
      { messages: [] },
      { new: true }
    );

    if (!chat) {
      return res.status(404).json({ 
        success: false, 
        message: "Chat not found" 
      });
    }

    res.json({ success: true, message: "Chat messages cleared", chat });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
};

// Get chat statistics (voice count, email count, etc.)
export const getChatStats = async (req, res) => {
  try {
    const userId = req.user._id;
    const { chatId } = req.params;

    const chat = await req.models.Chat.findOne({ _id: chatId, userId });
    if (!chat) {
      return res.status(404).json({ 
        success: false, 
        message: "Chat not found" 
      });
    }

    // Count different message types
    const stats = chat.messages.reduce((acc, message) => {
      acc.totalMessages++;
      
      if (message.type === 'voice') acc.voiceMessages++;
      if (message.type === 'email') acc.emailMessages++;
      if (message.type === 'text') acc.textMessages++;
      
      if (message.role === 'user') acc.userMessages++;
      if (message.role === 'assistant') acc.aiMessages++;
      
      return acc;
    }, {
      totalMessages: 0,
      voiceMessages: 0,
      emailMessages: 0,
      textMessages: 0,
      userMessages: 0,
      aiMessages: 0
    });

    res.json({ success: true, stats });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
};