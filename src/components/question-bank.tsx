"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EllipsisVertical } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";

type McqListItem = {
	id: string;
	name: string;
	description: string;
};

type McqChoice = {
	id: string;
	label: string;
	isCorrect: boolean;
	position: number;
};

type Mcq = McqListItem & {
	choices: McqChoice[];
};

export function QuestionBank() {
	const router = useRouter();
	const [items, setItems] = useState<McqListItem[]>([]);
	const [loaded, setLoaded] = useState(false);
	const [logoutPending, setLogoutPending] = useState(false);
	const [preview, setPreview] = useState<Mcq | null>(null);
	const [previewChoiceId, setPreviewChoiceId] = useState<string | null>(null);
	const [previewResult, setPreviewResult] = useState<string | null>(null);
	const [previewPending, setPreviewPending] = useState(false);
	const [deleteTarget, setDeleteTarget] = useState<McqListItem | null>(null);
	const [deletePending, setDeletePending] = useState(false);

	const loadItems = useCallback(async () => {
		const response = await fetch("/api/mcqs");
		const body = (await response.json()) as { items?: McqListItem[] };
		setItems(body.items ?? []);
		setLoaded(true);
	}, []);

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			const response = await fetch("/api/mcqs");
			const body = (await response.json()) as { items?: McqListItem[] };
			if (cancelled) {
				return;
			}
			setItems(body.items ?? []);
			setLoaded(true);
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	async function onLogout() {
		setLogoutPending(true);
		try {
			await fetch("/api/auth/logout", { method: "POST" });
			router.push("/login");
		} finally {
			setLogoutPending(false);
		}
	}

	async function onPreview(item: McqListItem) {
		setPreviewResult(null);
		setPreviewChoiceId(null);
		const response = await fetch(`/api/mcqs/${item.id}`);
		if (!response.ok) {
			return;
		}
		const mcq = (await response.json()) as Mcq;
		setPreview(mcq);
	}

	async function onSubmitPreview() {
		if (!preview || !previewChoiceId) {
			return;
		}
		setPreviewPending(true);
		try {
			const response = await fetch(`/api/mcqs/${preview.id}/attempts`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ choiceId: previewChoiceId }),
			});
			const body = (await response.json()) as { isCorrect?: boolean };
			setPreviewResult(body.isCorrect ? "Correct" : "Incorrect");
		} finally {
			setPreviewPending(false);
		}
	}

	async function onConfirmDelete() {
		if (!deleteTarget) {
			return;
		}
		setDeletePending(true);
		try {
			await fetch(`/api/mcqs/${deleteTarget.id}`, { method: "DELETE" });
			setDeleteTarget(null);
			await loadItems();
		} finally {
			setDeletePending(false);
		}
	}

	return (
		<div className="flex w-full max-w-5xl flex-col gap-6">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<h1 className="text-2xl font-semibold">Question Bank</h1>
				<div className="flex items-center gap-2">
					<Link href="/mcqs/new" className={buttonVariants()}>
						Create question
					</Link>
					<Button type="button" variant="outline" onClick={onLogout} disabled={logoutPending}>
						Log out
					</Button>
				</div>
			</div>

			{loaded && items.length === 0 ? (
				<p className="text-muted-foreground">
					No questions yet. Create a question to start the shared bank.
				</p>
			) : null}

			{loaded && items.length > 0 ? (
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Name</TableHead>
							<TableHead>Description</TableHead>
							<TableHead className="w-16">Actions</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{items.map((item) => (
							<TableRow key={item.id}>
								<TableCell>{item.name}</TableCell>
								<TableCell>{item.description.trim() ? item.description : "—"}</TableCell>
								<TableCell>
									<DropdownMenu>
										<DropdownMenuTrigger
											render={<Button variant="ghost" size="icon" />}
											aria-label={`Actions for ${item.name}`}
										>
											<EllipsisVertical />
										</DropdownMenuTrigger>
										<DropdownMenuContent align="end">
											<DropdownMenuItem render={<Link href={`/mcqs/${item.id}/edit`} />}>
												Edit
											</DropdownMenuItem>
											<DropdownMenuItem onClick={() => void onPreview(item)}>
												Preview
											</DropdownMenuItem>
											<DropdownMenuItem
												variant="destructive"
												onClick={() => setDeleteTarget(item)}
											>
												Delete
											</DropdownMenuItem>
										</DropdownMenuContent>
									</DropdownMenu>
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			) : null}

			<Dialog
				open={preview !== null}
				onOpenChange={(open) => {
					if (!open) {
						setPreview(null);
						setPreviewChoiceId(null);
						setPreviewResult(null);
					}
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{preview?.name}</DialogTitle>
						{preview?.description ? (
							<DialogDescription>{preview.description}</DialogDescription>
						) : (
							<DialogDescription>Choose an answer and submit it.</DialogDescription>
						)}
					</DialogHeader>
					<fieldset className="flex flex-col gap-2">
						<legend className="sr-only">Choices</legend>
						{preview?.choices.map((choice) => (
							<label key={choice.id} className="flex items-center gap-2">
								<input
									type="radio"
									name="preview-choice"
									value={choice.id}
									checked={previewChoiceId === choice.id}
									onChange={() => setPreviewChoiceId(choice.id)}
								/>
								{choice.label}
							</label>
						))}
					</fieldset>
					{previewResult ? (
						<p role="status" className="text-sm font-medium">
							{previewResult}
						</p>
					) : null}
					<DialogFooter>
						<Button
							type="button"
							onClick={() => void onSubmitPreview()}
							disabled={!previewChoiceId || previewPending}
						>
							Submit answer
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog
				open={deleteTarget !== null}
				onOpenChange={(open) => {
					if (!open) {
						setDeleteTarget(null);
					}
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Delete question</DialogTitle>
						<DialogDescription>
							{deleteTarget
								? `"${deleteTarget.name}" will be permanently deleted, including its choices and attempts.`
								: "This question will be permanently deleted."}
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button type="button" variant="outline" onClick={() => setDeleteTarget(null)}>
							Cancel
						</Button>
						<Button
							type="button"
							variant="destructive"
							onClick={() => void onConfirmDelete()}
							disabled={deletePending}
						>
							Delete question
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
