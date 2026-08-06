import PromptLibrary from "@/components/prompt-library";
import { getMeta } from "@/lib/prompt-store";

export default function HomePage() {
  return <PromptLibrary meta={getMeta()} />;
}
