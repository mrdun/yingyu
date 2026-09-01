import type { PictureWord } from "~/types";
import { getHttp } from "./http";

export async function fetchPictureWords() {
  const http = getHttp();
  return (await http<PictureWord[]>("/picture-word", {
    method: "get",
  })) as PictureWord[];
}
