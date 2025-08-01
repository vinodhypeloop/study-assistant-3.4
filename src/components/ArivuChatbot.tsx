
import { useState, useRef, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, Paperclip, Image, MessageCircle, Brain, User, Languages } from "lucide-react";
import { toast } from "sonner";
import { useAuthState } from "react-firebase-hooks/auth";
import { auth } from "@/config/firebase";
import { getStudyHistory } from "@/services/studyHistoryService";

interface Message {
  id: string;
  content: string;
  sender: "user" | "arivu";
  timestamp: Date;
  attachments?: File[];
}

const ArivuChatbot = () => {
  const [user] = useAuthState(auth);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      content: "Hello! I'm Arivu, your intelligent study companion. I have access to your complete study history and can provide personalized guidance. I can help with TNPSC preparation, connect your current questions to previously studied materials, suggest study strategies based on your performance, and much more. What would you like to explore today?",
      sender: "arivu",
      timestamp: new Date()
    }
  ]);
  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [language, setLanguage] = useState<"english" | "tamil">("english");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || "AIzaSyAJ2P2TqBOXQncnBgT0T_BNsLcAA7cToo4";

  useEffect(() => {
    if (language === "tamil") {
      setMessages(prev => prev.length === 1 ? [{
        id: "1",
        content: "வணக்கம்! நான் அறிவு, உங்கள் புத்திசாலி படிப்பு துணைவன். உங்கள் முழு படிப்பு வரலாறும் எனக்குத் தெரியும், தனிப்பட்ட வழிகாட்டுதல் வழங்க முடியும். தமிழ்நாடு பொதுச் சேவை ஆணையம் தயாரிப்பு, முன்பு படித்த பொருட்களுடன் தற்போதைய கேள்விகளை இணைத்தல், உங்கள் செயல்திறனின் அடிப்படையில் படிப்பு உத்திகளை பரிந்துரைத்தல் மற்றும் பல விஷயங்களில் உதவ முடியும். இன்று நீங்கள் என்ன ஆராய விரும்புகிறீர்கள்?",
        sender: "arivu",
        timestamp: new Date()
      }] : prev);
    } else {
      setMessages(prev => prev.length === 1 ? [{
        id: "1",
        content: "Hello! I'm Arivu, your intelligent study companion. I have access to your complete study history and can provide personalized guidance. I can help with TNPSC preparation, connect your current questions to previously studied materials, suggest study strategies based on your performance, and much more. What would you like to explore today?",
        sender: "arivu",
        timestamp: new Date()
      }] : prev);
    }
  }, [language]);

  const fetchRecentStudyHistory = async () => {
    if (!user) return "";
    
    try {
      const history = await getStudyHistory(user.uid);
      const recentHistory = history.slice(0, 10); // Get more history for better context
      
      // Create comprehensive study context
      const analysisRecords = recentHistory.filter(h => h.type === "analysis");
      const quizRecords = recentHistory.filter(h => h.type === "quiz");
      
      let contextText = "";
      
      if (analysisRecords.length > 0) {
        contextText += "RECENT STUDY MATERIALS:\n";
        analysisRecords.slice(0, 5).forEach((record, index) => {
          if (record.analysisData) {
            contextText += `${index + 1}. ${record.fileName || 'Study Material'}\n`;
            contextText += `   Key Topics: ${record.analysisData.keyPoints?.slice(0, 3).join(', ') || 'N/A'}\n`;
            contextText += `   Summary: ${record.analysisData.summary?.substring(0, 100) || 'N/A'}...\n`;
            if (record.analysisData.studyPoints?.length > 0) {
              contextText += `   Study Points: ${record.analysisData.studyPoints.slice(0, 2).map(p => p.title).join(', ')}\n`;
            }
          }
        });
        contextText += "\n";
      }
      
      if (quizRecords.length > 0) {
        contextText += "RECENT QUIZ PERFORMANCE:\n";
        quizRecords.slice(0, 3).forEach((record, index) => {
          contextText += `${index + 1}. ${record.fileName || 'Quiz'} - Score: ${record.score}/${record.totalQuestions} (${record.percentage}%)\n`;
          contextText += `   Difficulty: ${record.difficulty}, Language: ${record.language}\n`;
        });
        
        // Calculate average performance
        const avgScore = Math.round(quizRecords.reduce((acc, h) => acc + (h.percentage || 0), 0) / quizRecords.length);
        contextText += `   Average Performance: ${avgScore}%\n\n`;
      }
      
      // Add study patterns and suggestions
      if (recentHistory.length > 0) {
        const recentTopics = analysisRecords
          .map(r => r.analysisData?.mainTopic || r.fileName)
          .filter(Boolean)
          .slice(0, 5);
        
        if (recentTopics.length > 0) {
          contextText += `RECENT STUDY FOCUS: ${recentTopics.join(', ')}\n`;
        }
        
        // Add performance insights
        if (quizRecords.length >= 2) {
          const recentPerformance = quizRecords.slice(0, 3).map(q => q.percentage || 0);
          const trend = recentPerformance[0] > recentPerformance[1] ? "improving" : "needs attention";
          contextText += `PERFORMANCE TREND: ${trend}\n`;
        }
      }
      
      return contextText;
    } catch (error) {
      console.error("Error fetching study history:", error);
      return "";
    }
  };

  const handleFileSelect = (files: FileList | null) => {
    if (!files) return;
    
    const fileArray = Array.from(files);
    const validFiles = fileArray.filter(file => 
      file.type.startsWith('image/') || file.type === 'application/pdf'
    );
    
    if (validFiles.length !== fileArray.length) {
      toast.error("Only image files and PDF files are supported");
    }
    
    setSelectedFiles(prev => [...prev, ...validFiles]);
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const convertToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  };

  const sendMessage = async () => {
    if (!inputMessage.trim() && selectedFiles.length === 0) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      content: inputMessage,
      sender: "user",
      timestamp: new Date(),
      attachments: selectedFiles
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage("");
    setIsLoading(true);

    try {
      const conversationHistory = messages.slice(-5).map(msg => 
        `${msg.sender === 'user' ? 'User' : 'Arivu'}: ${msg.content}`
      ).join('\n');

      const studyHistory = await fetchRecentStudyHistory();

      const languageInstruction = language === "tamil" 
        ? "Please respond in Tamil language using Tamil script."
        : "Please respond in English language.";

      // Enhanced context-aware prompt
      let prompt = `You are 'Arivu', an intelligent AI study companion with deep knowledge of the user's learning journey. You can help with:

1. TNPSC (Tamil Nadu Public Service Commission) exam preparation - your primary expertise
2. General knowledge and current affairs
3. Math problems and calculations
4. Science and technology questions
5. History, geography, and social studies
6. Analysis of uploaded documents and images
7. Any other questions users might have

INTELLIGENT FEATURES:
- You have access to the user's complete study history and can reference previous materials
- You can suggest connections between current questions and previously studied topics
- You can provide personalized study recommendations based on past performance
- You can identify knowledge gaps and suggest focused study areas
- You proactively offer relevant suggestions from the user's study database

RESPONSE APPROACH:
- Be helpful, accurate, and conversational
- ALWAYS check if the question relates to previously studied materials and mention connections
- Proactively suggest related topics from the user's study history when relevant
- For TNPSC topics, provide exam-focused content with memory tips
- When users ask general questions, check if they've studied related topics before
- Always be encouraging and supportive
- ${languageInstruction}
- Provide excellent memory tips and study strategies
- If you notice patterns in their study history, mention them helpfully

${studyHistory ? `USER'S STUDY CONTEXT:\n${studyHistory}\n` : 'No previous study history available.\n'}

PROACTIVE SUGGESTIONS:
- If the user asks about any topic, immediately check if they've studied related materials before
- Suggest connections: "I see you previously studied [topic], which connects to this because..."
- Offer study tips: "Based on your quiz performance in [subject], I recommend focusing on..."
- Provide memory aids: "Here's a great memory tip for this concept..."
- Reference past materials: "This relates to the [document] you analyzed earlier..."

Conversation history:
${conversationHistory}

User's new message: ${inputMessage}

Remember: Be proactive in connecting current questions to the user's study history and offer relevant suggestions!`;

      const requestBody: any = {
        contents: [
          {
            parts: [
              { text: prompt }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2000,
        }
      };

      // Add images if any
      if (selectedFiles.length > 0) {
        for (const file of selectedFiles) {
          if (file.type.startsWith('image/')) {
            const base64Image = await convertToBase64(file);
            requestBody.contents[0].parts.push({
              inline_data: {
                mime_type: file.type,
                data: base64Image.split(',')[1]
              }
            });
          }
        }
      }

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      const arivuResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (arivuResponse) {
        const arivuMessage: Message = {
          id: (Date.now() + 1).toString(),
          content: arivuResponse,
          sender: "arivu",
          timestamp: new Date()
        };
        setMessages(prev => [...prev, arivuMessage]);
      } else {
        throw new Error('No response from Arivu');
      }
    } catch (error) {
      console.error('Error sending message:', error);
      toast.error("Failed to get response from Arivu. Please try again.");
      
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: language === "tamil" 
          ? "மன்னிக்கவும், இப்போது பதிலளிப்பதில் சிக்கல் உள்ளது. சிறிது நேரம் கழித்து மீண்டும் முயற்சிக்கவும்."
          : "I'm sorry, I'm having trouble responding right now. Please try again in a moment.",
        sender: "arivu",
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      setSelectedFiles([]);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <div className="container mx-auto px-4 py-6">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <Card className="p-4 md:p-6 bg-white/90 backdrop-blur-sm shadow-xl border-0 mb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-gradient-to-r from-green-500 to-blue-600 rounded-full">
                  <MessageCircle className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold bg-gradient-to-r from-green-600 to-blue-600 bg-clip-text text-transparent">
                    Arivu - AI Assistant
                  </h1>
                  <p className="text-gray-600">Your intelligent study companion</p>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <Languages className="h-4 w-4 text-gray-500" />
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value as "english" | "tamil")}
                  className="p-2 border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none text-sm"
                >
                  <option value="english">English</option>
                  <option value="tamil">தமிழ்</option>
                </select>
              </div>
            </div>
          </Card>

          {/* Chat Area */}
          <Card className="bg-white/90 backdrop-blur-sm shadow-xl border-0">
            <ScrollArea className="h-[500px] p-4" ref={scrollAreaRef}>
              <div className="space-y-4">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex gap-3 ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    {message.sender === 'arivu' && (
                      <div className="w-8 h-8 bg-gradient-to-r from-green-500 to-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
                        <Brain className="h-4 w-4 text-white" />
                      </div>
                    )}
                    
                    <div className={`max-w-[80%] ${message.sender === 'user' ? 'order-1' : 'order-2'}`}>
                      <div
                        className={`p-3 rounded-2xl ${
                          message.sender === 'user'
                            ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white ml-auto'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
                        
                        {message.attachments && message.attachments.length > 0 && (
                          <div className="mt-2 space-y-1">
                            {message.attachments.map((file, index) => (
                              <div key={index} className="text-xs opacity-75">
                                📎 {file.name}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 mt-1 px-1">
                        {message.timestamp.toLocaleTimeString()}
                      </div>
                    </div>

                    {message.sender === 'user' && (
                      <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center flex-shrink-0 order-2">
                        <User className="h-4 w-4 text-gray-600" />
                      </div>
                    )}
                  </div>
                ))}
                
                {isLoading && (
                  <div className="flex gap-3">
                    <div className="w-8 h-8 bg-gradient-to-r from-green-500 to-blue-600 rounded-full flex items-center justify-center">
                      <Brain className="h-4 w-4 text-white" />
                    </div>
                    <div className="bg-gray-100 p-3 rounded-2xl">
                      <div className="flex gap-1">
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>

            {/* File Attachments */}
            {selectedFiles.length > 0 && (
              <div className="border-t border-gray-200 p-4">
                <div className="flex flex-wrap gap-2">
                  {selectedFiles.map((file, index) => (
                    <div key={index} className="flex items-center gap-2 bg-blue-50 p-2 rounded-lg">
                      {file.type.startsWith('image/') ? (
                        <Image className="h-4 w-4 text-blue-600" />
                      ) : (
                        <Paperclip className="h-4 w-4 text-blue-600" />
                      )}
                      <span className="text-sm text-blue-800 truncate max-w-[100px]">
                        {file.name}
                      </span>
                      <button
                        onClick={() => removeFile(index)}
                        className="text-red-500 hover:text-red-700 text-lg leading-none"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Input Area */}
            <div className="border-t border-gray-200 p-4">
              <div className="flex gap-2">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={(e) => handleFileSelect(e.target.files)}
                  accept="image/*,application/pdf"
                  multiple
                  className="hidden"
                />
                
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  variant="outline"
                  size="sm"
                  className="flex-shrink-0"
                >
                  <Paperclip className="h-4 w-4" />
                </Button>
                
                <Input
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder={language === "tamil" 
                    ? "எதைப் பற்றி கேட்க விரும்புகிறீர்கள்?"
                    : "Ask me anything..."
                  }
                  className="flex-1"
                  disabled={isLoading}
                />
                
                <Button
                  onClick={sendMessage}
                  disabled={isLoading || (!inputMessage.trim() && selectedFiles.length === 0)}
                  className="bg-gradient-to-r from-green-500 to-blue-600 hover:from-green-600 hover:to-blue-700 flex-shrink-0"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default ArivuChatbot;
