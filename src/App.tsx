import { Route, Routes } from "react-router-dom";
import RootLayout from "#/components/layout/root-layout";
import ChatPage from "#/routes/chat";
import HomePage from "#/routes/home";
import SettingsPage from "#/routes/settings";

export default function App() {
	return (
		<Routes>
			<Route element={<RootLayout />}>
				<Route path="/" element={<HomePage />} />
				<Route path="/chat/:chatId" element={<ChatPage />} />
				<Route path="/settings" element={<SettingsPage />} />
			</Route>
		</Routes>
	);
}
