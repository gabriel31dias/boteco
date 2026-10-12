import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/lib/utils";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { format, subDays } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import * as React from "react";

interface DateFilterProps {
    onDateRangeChange?: (dateRange: { startDate: string; endDate: string }) => void;
    /** texto fixo no botão, quando quem manda no período é a tela */
    label?: string;
    /** classes do botão, pra virar uma aba do filtro de período */
    className?: string;
}

const QUICK_FILTERS = [
    { label: "Hoje", days: 0 },
    { label: "7 dias", days: 6 },
    { label: "15 dias", days: 14 },
    { label: "30 dias", days: 29 },
];

const ymd = (date: Date) => format(date, "yyyy-MM-dd");

/** dd/MM sem depender de fuso: a string já vem no formato do banco */
const short = (value: string) => value.split("-").reverse().slice(0, 2).join("/");

export function DateFilter({ onDateRangeChange, label, className }: DateFilterProps = {}) {
    const [isOpen, setIsOpen] = React.useState(false);
    const [range, setRange] = React.useState({
        start: ymd(subDays(new Date(), 6)),
        end: ymd(new Date()),
    });
    const [quick, setQuick] = React.useState<string | null>("7 dias");

    const apply = (start: string, end: string, label: string | null) => {
        setRange({ start, end });
        setQuick(label);
        // range invertido não vai pra API; o usuário ainda está escolhendo
        if (start <= end) onDateRangeChange?.({ startDate: start, endDate: end });
    };

    const selectQuick = (label: string, days: number) => {
        const today = new Date();
        apply(ymd(days === 0 ? today : subDays(today, days)), ymd(today), label);
        setIsOpen(false);
    };

    const invalid = range.start > range.end;

    return (
        <PopoverPrimitive.Root open={isOpen} onOpenChange={setIsOpen}>
            <PopoverPrimitive.Trigger asChild>
                <Button
                    className={cn(
                        "h-9 px-3 gap-2 rounded-full border border-border bg-white dark:bg-transparent hover:bg-muted text-primary text-sm font-normal",
                        isOpen && "bg-muted",
                        className
                    )}
                >
                    {!label && <CalendarIcon className="h-4 w-4 flex-shrink-0" />}
                    <span className={cn(!label && "text-foreground/70")}>
                        {label ?? quick ?? `${short(range.start)} → ${short(range.end)}`}
                    </span>
                </Button>
            </PopoverPrimitive.Trigger>

            <PopoverPrimitive.Portal>
                <PopoverPrimitive.Content
                    align="end"
                    sideOffset={8}
                    collisionPadding={16}
                    className="z-50 w-[300px] rounded-xl border border-border bg-white p-4 shadow-md outline-none animate-in fade-in-0 zoom-in-95 dark:bg-card"
                >
                    <div className="grid grid-cols-4 gap-2">
                        {QUICK_FILTERS.map((item) => (
                            <button
                                key={item.label}
                                type="button"
                                onClick={() => selectQuick(item.label, item.days)}
                                className={cn(
                                    "rounded-lg px-2 py-1.5 text-xs transition-colors",
                                    quick === item.label
                                        ? "bg-primary text-primary-foreground"
                                        : "bg-muted/50 text-muted-foreground hover:bg-muted"
                                )}
                            >
                                {item.label}
                            </button>
                        ))}
                    </div>

                    {/* ponytail: input date nativo — calendário, teclado e locale vêm de graça */}
                    <div className="mt-4 flex items-end gap-2">
                        <label className="min-w-0 flex-1">
                            <span className="mb-1 block text-[10px] uppercase text-muted-foreground">
                                De
                            </span>
                            <input
                                type="date"
                                value={range.start}
                                max={range.end}
                                onChange={(event) => apply(event.target.value, range.end, null)}
                                className="h-9 w-full min-w-0 rounded-lg border border-border bg-transparent px-2 text-sm text-foreground outline-none focus:border-primary"
                            />
                        </label>
                        <label className="min-w-0 flex-1">
                            <span className="mb-1 block text-[10px] uppercase text-muted-foreground">
                                Até
                            </span>
                            <input
                                type="date"
                                value={range.end}
                                min={range.start}
                                onChange={(event) => apply(range.start, event.target.value, null)}
                                className="h-9 w-full min-w-0 rounded-lg border border-border bg-transparent px-2 text-sm text-foreground outline-none focus:border-primary"
                            />
                        </label>
                    </div>

                    {invalid && (
                        <p className="mt-2 text-xs text-primary">
                            A data final precisa ser depois da inicial.
                        </p>
                    )}
                </PopoverPrimitive.Content>
            </PopoverPrimitive.Portal>
        </PopoverPrimitive.Root>
    );
}
