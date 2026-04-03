import "@moq/watch/element";
import "@moq/watch/ui";

const viewer = document.getElementById("viewer") as HTMLElement;
const errorEl = document.getElementById("error") as HTMLParagraphElement;

const params = new URLSearchParams(window.location.search);
const url = params.get("url");
const name = params.get("name");

if (!url || !name) {
  errorEl.textContent = "URLが無効です。配信者から共有されたリンクを使用してください。";
} else {
  viewer.setAttribute("url", url);
  viewer.setAttribute("name", name);
}
