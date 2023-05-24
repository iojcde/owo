import EditorComponent from "@/components/Editor";
import { Metadata } from "next";
import Image from "next/image";

export const metadata: Metadata = {
  title: "owo - minimalist code editor",
};

export default function Home() {
  return (
    <main>
      <EditorComponent />
    </main>
  );
}
