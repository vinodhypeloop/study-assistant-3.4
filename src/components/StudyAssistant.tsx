import React from "react";
import { useState } from "react";
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '@/config/firebase';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Upload, FileText, Image, Settings, Languages, Brain, Zap } from "lucide-react";
import { analyzeImage, analyzeMultipleImages, analyzePdfContent, analyzePdfContentComprehensive, generateQuestions as generateQuestionsFromService } from "@/services/geminiService";
import { extractAllPdfText, findTotalPagesFromOcr, extractPageRangeFromOcr } from "@/utils/pdfReader";
import { toast } from "sonner";
import { useAppContext } from "@/contexts/AppContext";
import AnalysisResults from "./AnalysisResults";
import QuestionResults from "./QuestionResults";
import ModernQuizMode from "./ModernQuizMode";
import QuickAnalysisMode from "./QuickAnalysisMode";
import { PdfPageSelector } from "./PdfPageSelector";
import PageRangeSelector from "./PageRangeSelector";
import PageRangeQuizSelector from "./PageRangeQuizSelector";
import ComprehensivePdfResults from "./ComprehensivePdfResults";
import { PdfPageNavigator } from "./PdfPageNavigator";
import PdfResumeOptions from "./PdfResumeOptions";
import FileRecognitionModal from "./FileRecognitionModal";
import ModernAnalyzingState from "./ModernAnalyzingState";
import AdvancedAnalyzingState from "./AdvancedAnalyzingState";
import { getStudyHistoryForFile } from "@/services/studyHistoryService";

export interface AnalysisResult {
  keyPoints: string[];
  summary: string;
  tnpscRelevance: string;
  studyPoints: StudyPoint[];
  tnpscCategories: string[];
  language?: string;
  mainTopic?: string;
}

export interface StudyPoint {
  title: string;
  description: string;
  importance: "high" | "medium" | "low";
  memoryTip?: string;
}

export interface Question {
  question: string;
  options?: string[];
  answer: string;
  type: "mcq" | "assertion_reason";
  difficulty: string;
  tnpscGroup: string;
  explanation?: string;
}

export interface QuestionResult {
  questions: Question[];
  summary: string;
  keyPoints: string[];
  difficulty: string;
  totalQuestions?: number;
}

const StudyAssistant = () => {
  const [user] = useAuthState(auth);
  
  const {
    selectedFiles,
    setSelectedFiles,
    analysisResults,
    setAnalysisResults,
    questionResult,
    setQuestionResult,
    difficulty,
    setDifficulty,
    outputLanguage,
    setOutputLanguage,
    clearAppState
  } = useAppContext();

  const [currentView, setCurrentView] = useState<"upload" | "analysis" | "questions" | "quiz" | "quick-analysis" | "pdf-page-select" | "comprehensive-pdf" | "pdf-navigator" | "pdf-resume-options" | "quiz-page-select" | "old-pdf-page-select" | "page-range-quiz" | "file-recognition">("upload");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGeneratingQuestions, setIsGeneratingQuestions] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [analysisStep, setAnalysisStep] = useState("");
  const [pdfInfo, setPdfInfo] = useState<{file: File; totalPages: number} | null>(null);
  const [pdfFullText, setPdfFullText] = useState<string>("");
  const [existingStudyHistory, setExistingStudyHistory] = useState<{
    id: string;
    pageAnalysesMap: Map<number, any>;
    analyzedPages: number[];
    lastAnalyzed: Date;
  } | null>(null);
  const [isGeneratingNextPage, setIsGeneratingNextPage] = useState(false);
  const [currentAnalyzedPage, setCurrentAnalyzedPage] = useState<number>(1);
  const [isProcessingPageRange, setIsProcessingPageRange] = useState(false);
  const [comprehensiveResults, setComprehensiveResults] = useState<{
    pageAnalyses: Array<{
      pageNumber: number;
      keyPoints: string[];
      studyPoints: Array<{
        title: string;
        description: string;
        importance: "high" | "medium" | "low";
        tnpscRelevance: string;
      }>;
      summary: string;
      tnpscRelevance: string;
    }>;
    overallSummary: string;
    totalKeyPoints: string[];
    tnpscCategories: string[];
  } | null>(null);
  const [pdfCurrentPage, setPdfCurrentPage] = useState(1);

  const handleFileSelect = (files: FileList | null) => {
    if (!files) return;
    
    const fileArray = Array.from(files);
    const validFiles = fileArray.filter(file => 
      file.type.startsWith('image/') || file.type === 'application/pdf'
    );
    
    if (validFiles.length !== fileArray.length) {
      toast.error("Only image files (PNG, JPG, etc.) and PDF files are supported");
    }
    
    setSelectedFiles(validFiles);
  };

  const analyzeFiles = async () => {
    if (selectedFiles.length === 0) {
      toast.error("Please select files to analyze");
      return;
    }

    // Check if there's a PDF file
    const pdfFile = selectedFiles.find(file => file.type === 'application/pdf');
    if (pdfFile) {
      try {
        const fullText = await extractAllPdfText(pdfFile);
        const totalPages = findTotalPagesFromOcr(fullText);
        
        if (totalPages > 0) {
          setPdfInfo({ file: pdfFile, totalPages });
          setPdfFullText(fullText);
          
          // Generate file hash for better recognition
          const buffer = await pdfFile.arrayBuffer();
          const hash = await crypto.subtle.digest('SHA-256', buffer);
          const hashArray = Array.from(new Uint8Array(hash));
          const fileHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
          
          // Check for existing study history for this PDF using hash and size
          const existingHistory = await getStudyHistoryForFile(
            user?.uid || '', 
            pdfFile.name, 
            fileHash, 
            pdfFile.size
          );
          
          if (existingHistory && existingHistory.pageAnalysesMap && Object.keys(existingHistory.pageAnalysesMap).length > 0) {
            // Convert pageAnalysesMap back to Map and extract analyzed pages
            const pageAnalysesMap = new Map();
            const analyzedPages: number[] = [];
            
            Object.entries(existingHistory.pageAnalysesMap).forEach(([pageNum, analysis]) => {
              const pageNumber = parseInt(pageNum);
              pageAnalysesMap.set(pageNumber, analysis);
              analyzedPages.push(pageNumber);
            });
            
            setExistingStudyHistory({
              id: existingHistory.id!,
              pageAnalysesMap,
              analyzedPages,
              lastAnalyzed: existingHistory.timestamp.toDate()
            });
            
            // Show file recognition modal instead of directly going to resume options
            setCurrentView("file-recognition");
          } else {
            // Go directly to PDF navigator for new files
            setCurrentView("pdf-navigator");
          }
          return;
        } else {
          toast.error("Unable to process PDF. Please try a different file.");
          return;
        }
      } catch (error) {
        console.error("PDF analysis error:", error);
        toast.error("Failed to analyze PDF. Please try again.");
      }
      return;
    }

    // Handle image files
    setIsAnalyzing(true);
    setAnalysisProgress(0);
    setAnalysisStep("Initializing analysis...");
    
    try {
      const results: AnalysisResult[] = [];
      const totalFiles = selectedFiles.filter(f => f.type.startsWith('image/')).length;
      
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        if (file.type.startsWith('image/')) {
          setAnalysisStep(`Analyzing image ${i + 1} of ${totalFiles}...`);
          setAnalysisProgress((i / totalFiles) * 80);
          
          const result = await analyzeImage(file, outputLanguage);
          results.push({
            ...result,
            language: outputLanguage,
            mainTopic: result.studyPoints?.[0]?.title || "Study Material"
          });
        }
      }
      
      setAnalysisStep("Finalizing results...");
      setAnalysisProgress(100);
      
      setTimeout(() => {
        setAnalysisResults(results);
        setCurrentView("analysis");
        toast.success("Analysis completed successfully!");
        setIsAnalyzing(false);
      }, 1000);
    } catch (error) {
      console.error("Analysis error:", error);
      toast.error("Failed to analyze files. Please try again.");
      setIsAnalyzing(false);
    }
  };


  const generateQuestionsFromAnalysis = async () => {
    if (analysisResults.length === 0) return;
    
    setIsGeneratingQuestions(true);
    try {
      const result = await generateQuestionsFromService(analysisResults, difficulty, outputLanguage);
      setQuestionResult({
        ...result,
        totalQuestions: result.questions?.length || 0
      });
      setCurrentView("questions");
      toast.success("Questions generated successfully!");
    } catch (error) {
      console.error("Question generation error:", error);
      toast.error("Failed to generate questions. Please try again.");
    } finally {
      setIsGeneratingQuestions(false);
    }
  };



  const handleGenerateNextPage = async (pageNumber: number) => {
    if (!pdfInfo) return;
    
    console.log(`StudyAssistant: Generating page ${pageNumber}`);
    
    try {
      const fullText = await extractAllPdfText(pdfInfo.file);
      const pageContent = extractPageRangeFromOcr(fullText, pageNumber, pageNumber);
      
      if (!pageContent.trim()) {
        toast.error(`No content found on page ${pageNumber}`);
        return;
      }
      
      console.log(`Page ${pageNumber} content length:`, pageContent.length);
      
      const result = await analyzePdfContent(pageContent, outputLanguage);
      
      console.log(`Page ${pageNumber} analysis result:`, result);
      
      // Add the new page analysis to existing results
      const newPageAnalysis = {
        pageNumber,
        keyPoints: result.keyPoints || [],
        studyPoints: (result.studyPoints || []).map(point => ({
          title: point.title,
          description: point.description,
          importance: point.importance,
          tnpscRelevance: point.tnpscRelevance || ''
        })),
        summary: result.summary || '',
        tnpscRelevance: result.tnpscRelevance || ''
      };
      
      setComprehensiveResults(prev => {
        if (!prev) return null;
        
        // Check if page already exists
        const pageExists = prev.pageAnalyses.some(p => p.pageNumber === pageNumber);
        if (pageExists) {
          console.log(`Page ${pageNumber} already exists, not adding duplicate`);
          return prev; // Don't add duplicate
        }
        
        console.log(`Adding new page ${pageNumber} to results`);
        const updatedResults = {
          ...prev,
          pageAnalyses: [...prev.pageAnalyses, newPageAnalysis].sort((a, b) => a.pageNumber - b.pageNumber),
          totalKeyPoints: [...prev.totalKeyPoints, ...(result.keyPoints || [])]
        };
        
        console.log(`Updated results now has ${updatedResults.pageAnalyses.length} pages`);
        return updatedResults;
      });
      
      console.log(`Page ${pageNumber} analysis completed successfully`);
    } catch (error) {
      console.error(`Error analyzing page ${pageNumber}:`, error);
      toast.error(`Failed to analyze page ${pageNumber}. Please try again.`);
      throw error; // Re-throw to be caught by the component
    }
  };

  const startQuickAnalysis = () => {
    if (selectedFiles.length === 0) {
      toast.error("Please select files first");
      return;
    }
    setCurrentView("quick-analysis");
  };

  const handleQuickAnalysisQuiz = (result: QuestionResult) => {
    setQuestionResult({
      ...result,
      totalQuestions: result.questions?.length || 0
    });
    setCurrentView("quiz");
  };

  // Handle retake quiz from study history
  React.useEffect(() => {
    if (questionResult && currentView === "upload") {
      setCurrentView("quiz");
    }
  }, [questionResult]);

  const handlePdfNavigatorQuiz = async (pageRange: { start: number; end: number }, difficulty: string) => {
    if (!pdfInfo) return;
    
    setIsGeneratingQuestions(true);
    try {
      // Check if we have analyzed pages in the range
      const analyzedPagesInRange = [];
      for (let i = pageRange.start; i <= pageRange.end; i++) {
        if (existingStudyHistory?.pageAnalysesMap?.has(i)) {
          analyzedPagesInRange.push(existingStudyHistory.pageAnalysesMap.get(i));
        }
      }
      
      let analysisResult;
      if (analyzedPagesInRange.length > 0) {
        // Use existing analyses
        const combinedKeyPoints = analyzedPagesInRange.flatMap(p => p.keyPoints || []);
        const combinedSummary = analyzedPagesInRange.map(p => p.summary || '').join(' ');
        const combinedStudyPoints = analyzedPagesInRange.flatMap(p => p.studyPoints || []);
        
        analysisResult = {
          keyPoints: combinedKeyPoints,
          summary: combinedSummary,
          tnpscRelevance: `Quiz based on analyzed pages ${pageRange.start} to ${pageRange.end}`,
          studyPoints: combinedStudyPoints,
          tnpscCategories: ["PDF Quiz"]
        };
      } else {
        // Analyze the content first
        const contentToAnalyze = extractPageRangeFromOcr(pdfFullText, pageRange.start, pageRange.end);
        analysisResult = await analyzePdfContent(contentToAnalyze, outputLanguage);
      }
      
      const result = await generateQuestionsFromService([analysisResult], difficulty, outputLanguage);
      
      setQuestionResult({
        ...result,
        totalQuestions: result.questions?.length || 0
      });
      setCurrentView("questions");
      toast.success(`Quiz generated for pages ${pageRange.start} to ${pageRange.end}!`);
    } catch (error) {
      console.error("Question generation error:", error);
      toast.error("Failed to generate questions. Please try again.");
    } finally {
      setIsGeneratingQuestions(false);
    }
  };

  const handleShowPageRangeSelector = () => {
    if (!pdfInfo) return;
    setCurrentView("pdf-page-select");
  };

  const handlePageRangeConfirm = (startPage: number, endPage: number) => {
    // This will be handled by the PdfPageNavigator component
    setCurrentView("pdf-navigator");
  };

  const resetToUpload = () => {
    clearAppState();
    setExistingStudyHistory(null);
    setCurrentView("upload");
  };

  const startQuizFromAnalysis = () => {
    if (questionResult) {
      setCurrentView("quiz");
    }
  };

  const handleResumeAnalysis = () => {
    if (pdfInfo && existingStudyHistory) {
      setCurrentView("pdf-navigator");
    }
  };

  const handleStartNewAnalysis = () => {
    setExistingStudyHistory(null);
    if (pdfInfo) {
      setCurrentView("pdf-page-select");
    }
  };

  const handleContinueFromRecognition = () => {
    if (pdfInfo && existingStudyHistory) {
      setCurrentView("pdf-navigator");
    }
  };

  const handleStartNewFromRecognition = () => {
    setExistingStudyHistory(null);
    if (pdfInfo) {
      setCurrentView("pdf-page-select");
    }
  };

  const handleCancelRecognition = () => {
    setSelectedFiles([]);
    setPdfInfo(null);
    setExistingStudyHistory(null);
    setCurrentView("upload");
  };

  if (currentView === "quick-analysis") {
    return (
      <QuickAnalysisMode
        files={selectedFiles}
        difficulty={difficulty}
        outputLanguage={outputLanguage}
        onStartQuiz={handleQuickAnalysisQuiz}
        onReset={resetToUpload}
      />
    );
  }

  if (currentView === "quiz" && questionResult) {
    return (
      <ModernQuizMode
        result={questionResult}
        onReset={resetToUpload}
        onBackToAnalysis={() => setCurrentView("analysis")}
        difficulty={difficulty}
        outputLanguage={outputLanguage}
      />
    );
  }

  if (currentView === "questions" && questionResult) {
    return (
      <QuestionResults
        result={questionResult}
        onReset={resetToUpload}
        selectedFiles={selectedFiles}
        onStartQuiz={startQuizFromAnalysis}
      />
    );
  }

  if (currentView === "analysis" && analysisResults.length > 0) {
    return (
      <AnalysisResults
        result={analysisResults[0]}
        onReset={resetToUpload}
        selectedFiles={selectedFiles}
        onGenerateQuestions={generateQuestionsFromAnalysis}
        onStartQuiz={startQuizFromAnalysis}
        isGeneratingQuestions={isGeneratingQuestions}
      />
    );
  }


  if (currentView === "comprehensive-pdf" && comprehensiveResults) {
    return (
      <ComprehensivePdfResults
        pageAnalyses={comprehensiveResults.pageAnalyses}
        overallSummary={comprehensiveResults.overallSummary}
        totalKeyPoints={comprehensiveResults.totalKeyPoints}
        onReset={resetToUpload}
        onGenerateQuestions={() => {}} // Remove comprehensive quiz generation
        isGeneratingQuestions={isGeneratingQuestions}
      />
    );
  }

  if (currentView === "pdf-navigator" && pdfInfo) {
    return (
      <PdfPageNavigator
        file={pdfInfo.file}
        totalPages={pdfInfo.totalPages}
        fullText={pdfFullText}
        outputLanguage={outputLanguage}
        onReset={resetToUpload}
        onStartQuiz={handlePdfNavigatorQuiz}
        initialPageAnalyses={existingStudyHistory?.pageAnalysesMap}
        initialStudyHistoryId={existingStudyHistory?.id}
        currentPage={pdfCurrentPage}
        onPageChange={setPdfCurrentPage}
      />
    );
  }

  if (currentView === "pdf-resume-options" && pdfInfo && existingStudyHistory) {
    return (
      <PdfResumeOptions
        fileName={pdfInfo.file.name}
        totalPages={pdfInfo.totalPages}
        analyzedPages={existingStudyHistory.analyzedPages}
        lastAnalyzed={existingStudyHistory.lastAnalyzed}
        onResumeAnalysis={handleResumeAnalysis}
        onStartNewAnalysis={handleStartNewAnalysis}
        onBack={resetToUpload}
      />
    );
  }

  if (currentView === "pdf-page-select" && pdfInfo) {
    return (
      <PageRangeSelector
        totalPages={pdfInfo.totalPages}
        onConfirm={handlePageRangeConfirm}
        onBack={resetToUpload}
        title="Select PDF Pages"
        description="Choose which pages to analyze for TNPSC preparation"
        isProcessing={isProcessingPageRange}
      />
    );
  }

  if (currentView === "file-recognition" && pdfInfo && existingStudyHistory) {
    return (
      <FileRecognitionModal
        fileName={pdfInfo.file.name}
        totalPages={pdfInfo.totalPages}
        analyzedPages={existingStudyHistory.analyzedPages.length}
        lastAnalyzed={existingStudyHistory.lastAnalyzed}
        onContinue={handleContinueFromRecognition}
        onStartNew={handleStartNewFromRecognition}
        onCancel={handleCancelRecognition}
      />
    );
  }

  if (currentView === "quiz-page-select" && pdfInfo) {
    return (
      <PageRangeSelector
        totalPages={pdfInfo.totalPages}
        onConfirm={(startPage, endPage) => {
          setCurrentView("pdf-navigator");
        }}
        onBack={() => setCurrentView("upload")}
        title="Select Quiz Pages"
        description="Choose which pages to generate quiz questions from"
      />
    );
  }


  // Show analyzing state when processing
  if (isAnalyzing || isGeneratingNextPage) {
    const analysisType = "detailed";
    
    return (
      <AdvancedAnalyzingState
        progress={analysisProgress}
        step={analysisStep}
        analysisType={analysisType}
        fileName={selectedFiles[0]?.name}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-primary/5 to-secondary/10 relative overflow-hidden">
      {/* Animated Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-gradient-to-br from-primary/20 to-accent/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-gradient-to-br from-secondary/20 to-primary/20 rounded-full blur-3xl animate-pulse" style={{animationDelay: '2s'}}></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-gradient-to-br from-accent/10 to-primary/10 rounded-full blur-3xl animate-pulse" style={{animationDelay: '4s'}}></div>
      </div>
      
      <div className="p-4 relative z-10">
      <div className="container mx-auto max-w-4xl">
          <div className="text-center mb-8 animate-fadeInUp">
            <div className="flex items-center justify-center gap-3 mb-6">
              <div className="p-4 bg-gradient-to-r from-primary to-primary-glow rounded-full shadow-2xl pulse-glow">
                <Brain className="h-10 w-10 text-white" />
              </div>
              <h1 className="text-5xl md:text-6xl font-bold gradient-text">
                Ram's AI
              </h1>
            </div>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
              Transform your TNPSC preparation with AI-powered analysis. Upload your study materials and get instant insights, key points, and practice questions.
            </p>
          </div>

        <Card className="glass-card p-8 mb-8 animate-fadeInScale hover-lift">
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <label className="block text-sm font-semibold text-foreground">
                  <Settings className="h-4 w-4 inline mr-2" />
                  Difficulty Level
                </label>
                <select
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value)}
                  className="input-elegant"
                >
                  <option value="easy">🟢 Easy - Basic concepts</option>
                  <option value="medium">🟡 Medium - Standard level</option>
                  <option value="hard">🔴 Hard - Advanced level</option>
                  <option value="very-hard">⚫ Very Hard - Expert level</option>
                </select>
              </div>

              <div className="space-y-4">
                <label className="block text-sm font-semibold text-foreground">
                  <Languages className="h-4 w-4 inline mr-2" />
                  Output Language
                </label>
                <select
                  value={outputLanguage}
                  onChange={(e) => setOutputLanguage(e.target.value as "english" | "tamil")}
                  className="input-elegant"
                >
                  <option value="english">🇬🇧 English</option>
                  <option value="tamil">🇮🇳 தமிழ் (Tamil)</option>
                </select>
              </div>
            </div>

            <div className="interactive-card p-6 md:p-10 border-2 border-dashed border-border hover:border-primary transition-all duration-500 hover:bg-primary/5 group">{" "}
              <input
                type="file"
                multiple
                accept="image/*,application/pdf"
                onChange={(e) => handleFileSelect(e.target.files)}
                className="hidden"
                id="file-upload"
              />
              <label htmlFor="file-upload" className="cursor-pointer block text-center">
                <Upload className="h-16 md:h-20 w-16 md:w-20 text-muted-foreground mx-auto mb-4 md:mb-6 animate-float group-hover:text-primary transition-colors duration-300" />
                <p className="text-xl md:text-2xl font-bold text-foreground mb-2 md:mb-3 group-hover:text-primary transition-colors">
                  Upload Your Study Materials
                </p>
                <p className="text-muted-foreground text-lg md:text-xl mb-2">
                  Drag & drop or click to select images and PDF files
                </p>
                <p className="text-sm md:text-base text-muted-foreground/60">
                  Supports: JPG, PNG, GIF, PDF (up to 10MB each)
                </p>
              </label>
            </div>

            {selectedFiles.length > 0 && (
              <div className="space-y-8 animate-fadeInUp">
                <h3 className="font-semibold text-gray-800 text-lg">
                  <span className="gradient-text">Selected Files ({selectedFiles.length})</span>
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 stagger-animation">
                  {selectedFiles.map((file, index) => (
                    <div key={index} className="glass-card p-6 hover-lift">
                      <div className="flex items-center gap-3 mb-3">
                        {file.type.startsWith('image/') ? (
                          <Image className="h-7 w-7 text-blue-600 animate-pulse" />
                        ) : (
                          <FileText className="h-7 w-7 text-red-600 animate-pulse" />
                        )}
                        <span className="text-base font-semibold text-gray-700">
                          {file.type.startsWith('image/') ? 'Image' : 'PDF'}
                        </span>
                      </div>
                      <div className="text-sm text-gray-600 space-y-1">
                        <div className="font-medium truncate mb-1">{file.name}</div>
                        <div className="text-xs">({(file.size / 1024 / 1024).toFixed(2)} MB)</div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex flex-col sm:flex-row gap-4 md:gap-6 pt-6 md:pt-8">
                  <Button
                    onClick={analyzeFiles}
                    disabled={isAnalyzing}
                    className="flex-1 btn-primary py-6 md:py-8 text-lg md:text-xl font-bold"
                  >
                    {isAnalyzing ? (
                      <>
                        <div className="animate-spin rounded-full h-5 w-5 md:h-6 md:w-6 border-b-2 border-white mr-2 md:mr-3"></div>
                        Analyzing...
                      </>
                    ) : (
                      <>
                        <Settings className="h-5 w-5 md:h-6 md:w-6 mr-2 md:mr-3" />
                        Detailed Analysis
                      </>
                    )}
                  </Button>

                  <Button
                    onClick={startQuickAnalysis}
                    className="flex-1 bg-gradient-to-r from-accent-success to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white py-6 md:py-8 text-lg md:text-xl font-bold shadow-2xl hover:shadow-3xl transform hover:scale-105 transition-all duration-300 border-0 rounded-2xl relative overflow-hidden group"
                  >
                    <Zap className="h-5 w-5 md:h-6 md:w-6 mr-2 md:mr-3 group-hover:rotate-12 transition-transform" />
                    Quick Quiz
                  </Button>
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* Features Preview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 stagger-animation">
          <Card className="glass-card p-8 text-center hover-lift">
            <div className="p-4 bg-blue-100 rounded-full w-fit mx-auto mb-6 animate-bounceIn">
              <FileText className="h-8 w-8 text-blue-600" />
            </div>
            <h3 className="text-xl font-bold text-gray-800 mb-3">Smart Analysis</h3>
            <p className="text-gray-600 text-base leading-relaxed">
              AI-powered analysis extracts key points and creates crisp, memorable study notes
            </p>
          </Card>

          <Card className="glass-card p-8 text-center hover-lift">
            <div className="p-4 bg-purple-100 rounded-full w-fit mx-auto mb-6 animate-bounceIn" style={{animationDelay: '0.2s'}}>
              <Brain className="h-8 w-8 text-purple-600" />
            </div>
            <h3 className="text-xl font-bold text-gray-800 mb-3">MCQ & Assertion Questions</h3>
            <p className="text-gray-600 text-base leading-relaxed">
              Generate TNPSC-style multiple choice and assertion-reason questions for practice
            </p>
          </Card>

          <Card className="glass-card p-8 text-center hover-lift">
            <div className="p-4 bg-green-100 rounded-full w-fit mx-auto mb-6 animate-bounceIn" style={{animationDelay: '0.4s'}}>
              <Zap className="h-8 w-8 text-green-600" />
            </div>
            <h3 className="text-xl font-bold text-gray-800 mb-3">Instant Results</h3>
            <p className="text-gray-600 text-base leading-relaxed">
              Get immediate feedback with detailed explanations and performance tracking
            </p>
          </Card>
        </div>
      </div>
      </div>
    </div>
  );
};

export default StudyAssistant;