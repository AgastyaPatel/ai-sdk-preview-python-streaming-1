"use client";

import { PreviewMessage, ThinkingMessage } from "@/components/message";
import { MultimodalInput } from "@/components/multimodal-input";
import { Overview } from "@/components/overview";
import { useScrollToBottom } from "@/hooks/use-scroll-to-bottom";
import { useChat, type CreateUIMessage, type UIMessage } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { toast } from "sonner";
import React from "react";

// Custom transport that logs raw chunks before processing
class LoggingChatTransport extends DefaultChatTransport<UIMessage> {
  async sendMessages(
    options: Parameters<DefaultChatTransport<UIMessage>["sendMessages"]>[0]
  ) {
    const { abortSignal, ...rest } = options;

    // Build the request manually to intercept the raw response
    const response = await fetch("/api/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: rest.messages }),
      signal: abortSignal,
    });

    if (!response.ok || !response.body) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    // Create a pass-through stream that logs chunks
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    const loggingStream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        const { done, value } = await reader.read();
        if (done) {
          console.log("=== STREAM END ===");
          controller.close();
          return;
        }
        // Log the raw chunk
        const text = decoder.decode(value, { stream: true });
        console.log("RAW CHUNK:", text);
        controller.enqueue(value);
      },
    });

    // Process through the parent's stream processor
    return this["processResponseStream"](loggingStream);
  }
}

const loggingTransport = new LoggingChatTransport();

export function Chat() {
  const chatId = "001";

  const { messages, setMessages, sendMessage, status, stop } = useChat({
    id: chatId,
    transport: loggingTransport,
    onError: (error: Error) => {
      if (error.message.includes("Too many requests")) {
        toast.error(
          "You are sending too many messages. Please try again later."
        );
      }
    },
  });

  const [messagesContainerRef, messagesEndRef] =
    useScrollToBottom<HTMLDivElement>();

  const [input, setInput] = React.useState("");

  const isLoading = status === "submitted" || status === "streaming";

  const handleSubmit = (event?: { preventDefault?: () => void }) => {
    event?.preventDefault?.();
    if (input.trim()) {
      sendMessage({ text: input });
      setInput("");
    }
  };

  return (
    <div className="flex flex-col min-w-0 h-[calc(100dvh-52px)] bg-background">
      <div
        ref={messagesContainerRef}
        className="flex flex-col min-w-0 gap-6 flex-1 overflow-y-scroll pt-4"
      >
        {messages.length === 0 && <Overview />}

        {messages.map((message: UIMessage, index: number) => (
          <PreviewMessage
            key={message.id}
            chatId={chatId}
            message={message}
            isLoading={isLoading && messages.length - 1 === index}
          />
        ))}

        {isLoading &&
          messages.length > 0 &&
          messages[messages.length - 1].role === "user" && <ThinkingMessage />}

        <div
          ref={messagesEndRef}
          className="shrink-0 min-w-[24px] min-h-[24px]"
        />
      </div>

      <form className="flex mx-auto px-4 bg-background pb-4 md:pb-6 gap-2 w-full md:max-w-3xl">
        <MultimodalInput
          chatId={chatId}
          input={input}
          setInput={setInput}
          handleSubmit={handleSubmit}
          isLoading={isLoading}
          stop={stop}
          messages={messages}
          setMessages={setMessages}
          sendMessage={sendMessage}
        />
      </form>
    </div>
  );
}
