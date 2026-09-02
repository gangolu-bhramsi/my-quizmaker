"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function QuestionBankStub() {
	const router = useRouter();
	const [pending, setPending] = useState(false);

	async function onLogout() {
		setPending(true);
		try {
			await fetch("/api/auth/logout", { method: "POST" });
			router.push("/login");
		} finally {
			setPending(false);
		}
	}

	return (
		<Card className="w-full max-w-lg">
			<CardHeader>
				<CardTitle>
					<h1>Question Bank</h1>
				</CardTitle>
				<CardDescription>
					This area will hold multiple-choice question authoring in a later sprint.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<Button type="button" variant="outline" onClick={onLogout} disabled={pending}>
					Log out
				</Button>
			</CardContent>
		</Card>
	);
}
