import "./globals.css";
import NavBar from "../components/NavBar";

export const metadata = {
  title: "symphony — by vvaibsmusic",
  description: "Music intelligence dashboard tracking viral songs, new releases, and artist analytics across YouTube and Spotify",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <NavBar />
        {children}
      </body>
    </html>
  );
}
