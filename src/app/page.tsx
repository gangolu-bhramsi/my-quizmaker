import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function Home() {
	return (
		<div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
			<Card className="w-full max-w-md">
				<CardHeader>
					<CardTitle>QuizMaker</CardTitle>
					<CardDescription>
						A shared test bank for teachers. Register or log in to get started.
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-3 sm:flex-row">
					<Link href="/register" className={buttonVariants()}>
						Register
					</Link>
					<Link href="/login" className={buttonVariants({ variant: "outline" })}>
						Log in
					</Link>
				</CardContent>
			</Card>
		</div>
	);
}
