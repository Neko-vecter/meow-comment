import { Check, ChevronDown, Copy, X } from "lucide-react";
import {
    type ReactNode,
    type SubmitEvent,
    useEffect,
    useId,
    useRef,
    useState,
} from "react";
import { ConfirmPrompt } from "../ConfirmPrompt";
import { InlineAlert } from "../InlineAlert";
import styles from "./DrawerCard.module.css";

export interface DrawerCardField {
    id: string;
    label: string;
    value: ReactNode;
}

export interface DrawerCardSection {
    id: string;
    label: string;
}

export interface DrawerCardAction {
    id: string;
    label: string;
    type?: "button" | "submit";
    variant?: "primary" | "secondary";
    icon?: ReactNode;
    onClick?: () => void | Promise<void>;
    disabled?: boolean;
    loading?: boolean;
    loadingLabel?: string;
}

export type DrawerCardItem =
    | {
          type: "field";
          id: string;
          label: string;
          editable: true;
          name: string;
          inputType?: "text" | "password" | "url";
          value?: string;
          placeholder?: string;
          required?: boolean;
          autoFocus?: boolean;
          span?: "full";
      }
    | {
          type: "select";
          id: string;
          label: string;
          name: string;
          value: string;
          options: Array<{ value: string; label: string }>;
          context?: { title: string; description?: string };
          span?: "full";
      }
    | ({
          type: "field";
          editable?: false;
          span?: "full";
          copyable?: boolean;
          copyValue?: string;
      } & DrawerCardField)
    | {
          type: "content";
          id: string;
          label: string;
          value: ReactNode;
      }
    | {
          type: "action";
          id: string;
          label: string;
          description?: ReactNode;
          button: Omit<DrawerCardAction, "id" | "type">;
          confirm?: {
              title: ReactNode;
              description: ReactNode;
              cancelLabel: string;
              confirmLabel: string;
              pendingLabel?: string;
          };
      }
    | {
          type: "checkbox";
          id: string;
          label: string;
          title?: string;
          disabled?: boolean;
          checked?: boolean;
      }
    | {
          type: "disclosure";
          id: string;
          collapsedLabel: string;
          expandedLabel: string;
          fields?: DrawerCardField[];
          description?: ReactNode;
      };

export interface DrawerCardGroup {
    id: string;
    items: DrawerCardItem[];
    layout?: "stack" | "grid";
    size?: "default" | "compact";
}

export interface DrawerCardProps {
    title: ReactNode;
    closeLabel: string;
    copyLabel: string;
    copiedLabel: string;
    onClose: () => void;
    cards: DrawerCardGroup[];
    actions: DrawerCardAction[];
    sections?: DrawerCardSection[];
    activeSectionID?: string;
    sectionsLabel?: string;
    onSectionChange?: (sectionID: string) => void;
    eyebrow?: ReactNode;
    onSubmit?: (values: Record<string, string>) => void | Promise<void>;
    submitError?: string;
}

export function DrawerCard({
    title,
    closeLabel,
    copyLabel,
    copiedLabel,
    onClose,
    cards,
    actions,
    sections,
    activeSectionID,
    sectionsLabel,
    onSectionChange,
    eyebrow,
    onSubmit,
    submitError,
}: DrawerCardProps) {
    const titleId = useId();
    const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>(
        {},
    );
    const [openConfirmations, setOpenConfirmations] = useState<
        Record<string, boolean>
    >({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [copiedFieldId, setCopiedFieldId] = useState<string | null>(null);
    const [openSelectID, setOpenSelectID] = useState<string | null>(null);
    const [selectValues, setSelectValues] = useState<Record<string, string>>(
        {},
    );
    const actionButtonWrapRefs = useRef<Record<string, HTMLDivElement | null>>(
        {},
    );
    const selectWrapRefs = useRef<Record<string, HTMLDivElement | null>>({});
    const selectTriggerRefs = useRef<Record<string, HTMLButtonElement | null>>(
        {},
    );
    const selectOptionRefs = useRef<
        Record<string, Record<string, HTMLButtonElement | null>>
    >({});
    const copyResetTimer = useRef<number | null>(null);
    const openConfirmationID = Object.keys(openConfirmations).find(
        (id) => openConfirmations[id],
    );

    useEffect(() => {
        if (!openConfirmationID) {
            return;
        }

        const anchor = actionButtonWrapRefs.current[openConfirmationID];
        if (!anchor) {
            return;
        }

        function handleOutsidePointerDown(event: PointerEvent) {
            if (
                anchor &&
                event.target instanceof Node &&
                !anchor.contains(event.target)
            ) {
                setOpenConfirmations({});
            }
        }

        document.addEventListener("pointerdown", handleOutsidePointerDown);
        return () => {
            document.removeEventListener(
                "pointerdown",
                handleOutsidePointerDown,
            );
        };
    }, [openConfirmationID]);

    const openSelectItem = openSelectID
        ? cards
              .flatMap((card) => card.items)
              .find(
                  (item) =>
                      item.type === "select" && item.id === openSelectID,
              )
        : undefined;

    useEffect(() => {
        const selectID = openSelectID || "";
        if (!selectID) {
            return;
        }

        const anchor = selectWrapRefs.current[selectID];
        function handleOutsidePointerDown(event: PointerEvent) {
            if (
                anchor &&
                event.target instanceof Node &&
                !anchor.contains(event.target)
            ) {
                setOpenSelectID(null);
            }
        }

        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === "Escape") {
                event.preventDefault();
                setOpenSelectID(null);
                selectTriggerRefs.current[selectID]?.focus();
            }
        }

        document.addEventListener("pointerdown", handleOutsidePointerDown);
        document.addEventListener("keydown", handleKeyDown);
        return () => {
            document.removeEventListener(
                "pointerdown",
                handleOutsidePointerDown,
            );
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [openSelectID]);

    useEffect(() => {
        if (openSelectID && openSelectItem?.type === "select") {
            const selectedValue =
                selectValues[openSelectItem.id] ?? openSelectItem.value;
            selectOptionRefs.current[openSelectID]?.[selectedValue]?.focus();
        }
    }, [openSelectID, openSelectItem, selectValues]);

    useEffect(
        () => () => {
            if (copyResetTimer.current !== null) {
                window.clearTimeout(copyResetTimer.current);
            }
        },
        [],
    );

    async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!onSubmit || isSubmitting) {
            return;
        }

        const values: Record<string, string> = {};
        new FormData(event.currentTarget).forEach((value, name) => {
            if (typeof value === "string") {
                values[name] = value;
            }
        });

        setIsSubmitting(true);
        try {
            await onSubmit(values);
        } finally {
            setIsSubmitting(false);
        }
    }

    async function copyFieldValue(id: string, value: string) {
        try {
            let copied = false;
            try {
                if (navigator.clipboard?.writeText) {
                    await navigator.clipboard.writeText(value);
                    copied = true;
                }
            } catch {
                // Fall back when clipboard permission is denied or unavailable.
            }

            if (!copied) {
                const input = document.createElement("textarea");
                input.value = value;
                input.readOnly = true;
                input.style.position = "fixed";
                input.style.opacity = "0";
                document.body.append(input);
                try {
                    input.select();
                    copied = document.execCommand("copy");
                } finally {
                    input.remove();
                }
            }

            if (copied) {
                setCopiedFieldId(id);
                scheduleCopyReset();
            }
        } catch {
            setCopiedFieldId(null);
        }
    }

    function scheduleCopyReset() {
        if (copyResetTimer.current !== null) {
            window.clearTimeout(copyResetTimer.current);
        }
        copyResetTimer.current = window.setTimeout(() => {
            setCopiedFieldId(null);
            copyResetTimer.current = null;
        }, 1600);
    }

    function renderItem(item: DrawerCardItem) {
        switch (item.type) {
            case "field": {
                const inputId = `${titleId}-${item.id}`;
                const fieldClassName = [
                    styles.field,
                    item.span === "full" ? styles.fieldFull : "",
                ]
                    .filter(Boolean)
                    .join(" ");

                if (item.editable) {
                    return (
                        <label
                            className={fieldClassName}
                            htmlFor={inputId}
                            key={item.id}
                        >
                            <span className={styles.fieldLabel}>{item.label}</span>
                            <input
                                autoFocus={item.autoFocus}
                                defaultValue={item.value}
                                id={inputId}
                                name={item.name}
                                placeholder={item.placeholder}
                                required={item.required}
                                type={item.inputType ?? "text"}
                            />
                        </label>
                    );
                }

                const valueToCopy =
                    item.copyValue ??
                    (typeof item.value === "string" ? item.value : undefined);
                const canCopy =
                    item.copyable !== false && valueToCopy !== undefined;
                const isCopied = copiedFieldId === item.id;
                const copyActionLabel = [
                    isCopied ? copiedLabel : copyLabel,
                    item.label,
                ].join(" ");

                return (
                    <div className={fieldClassName} key={item.id}>
                        <span className={styles.fieldLabel}>{item.label}</span>
                        <div className={styles.valueBox}>
                            <span>{item.value}</span>
                            {canCopy && (
                                <button
                                    aria-label={copyActionLabel}
                                    className={styles.copyAction}
                                    onClick={() =>
                                        void copyFieldValue(item.id, valueToCopy)
                                    }
                                    title={copyActionLabel}
                                    type="button"
                                >
                                    {isCopied ? (
                                        <Check aria-hidden="true" />
                                    ) : (
                                        <Copy aria-hidden="true" />
                                    )}
                                </button>
                            )}
                        </div>
                    </div>
                );
            }
            case "select": {
                const inputId = `${titleId}-${item.id}`;
                const listboxId = `${inputId}-options`;
                const fieldClassName = [
                    styles.field,
                    item.context ? styles.accountSelectRow : "",
                    item.span === "full" ? styles.fieldFull : "",
                ]
                    .filter(Boolean)
                    .join(" ");
                const selectedValue = selectValues[item.id] ?? item.value;
                const selectedOption =
                    item.options.find(
                        (option) => option.value === selectedValue,
                    ) ?? item.options[0];
                const isOpen = openSelectID === item.id;

                return (
                    <div className={fieldClassName} key={item.id}>
                        {item.context && (
                            <div className={styles.accountSelectIdentity}>
                                <strong>{item.context.title}</strong>
                                {item.context.description && (
                                    <span>{item.context.description}</span>
                                )}
                            </div>
                        )}
                        <div
                            className={
                                item.context
                                    ? styles.accountSelectControl
                                    : undefined
                            }
                        >
                            <span className={styles.fieldLabel}>{item.label}</span>
                            <div
                                className={styles.selectWrap}
                                ref={(node) => {
                                    selectWrapRefs.current[item.id] = node;
                                }}
                            >
                                <input
                                    name={item.name}
                                    type="hidden"
                                    value={selectedOption?.value ?? item.value}
                                />
                                <button
                                    aria-controls={listboxId}
                                    aria-expanded={isOpen}
                                    aria-haspopup="listbox"
                                    aria-label={`${item.context?.title ? `${item.context.title}, ` : ""}${item.label}: ${
                                        selectedOption?.label ?? item.value
                                    }`}
                                    className={styles.selectTrigger}
                                    id={inputId}
                                    onClick={() =>
                                        setOpenSelectID((current) =>
                                            current === item.id ? null : item.id,
                                        )
                                    }
                                    onKeyDown={(event) => {
                                        if (
                                            event.key === "ArrowDown" &&
                                            !isOpen
                                        ) {
                                            event.preventDefault();
                                            setOpenSelectID(item.id);
                                        }
                                    }}
                                    ref={(node) => {
                                        selectTriggerRefs.current[item.id] = node;
                                    }}
                                    type="button"
                                >
                                    <span>
                                        {selectedOption?.label ?? item.value}
                                    </span>
                                    <ChevronDown
                                        aria-hidden="true"
                                        className={
                                            isOpen ? styles.selectIsOpen : undefined
                                        }
                                    />
                                </button>
                                {isOpen && (
                                    <div
                                        aria-labelledby={inputId}
                                        className={styles.selectMenu}
                                        id={listboxId}
                                        role="listbox"
                                    >
                                        {item.options.map((option) => {
                                            const isSelected =
                                                option.value === selectedValue;
                                            return (
                                                <button
                                                    aria-selected={isSelected}
                                                    className={[
                                                        styles.selectOption,
                                                        isSelected
                                                            ? styles.selectedSelectOption
                                                            : "",
                                                    ]
                                                        .filter(Boolean)
                                                        .join(" ")}
                                                    key={option.value}
                                                    onClick={() => {
                                                        setSelectValues((current) =>
                                                            current[item.id] ===
                                                            option.value
                                                                ? current
                                                                : {
                                                                      ...current,
                                                                      [item.id]:
                                                                          option.value,
                                                                  },
                                                        );
                                                        setOpenSelectID(null);
                                                        selectTriggerRefs.current[
                                                            item.id
                                                        ]?.focus();
                                                    }}
                                                    ref={(node) => {
                                                        selectOptionRefs.current[
                                                            item.id
                                                        ] ??= {};
                                                        selectOptionRefs.current[
                                                            item.id
                                                        ][option.value] = node;
                                                    }}
                                                    role="option"
                                                    type="button"
                                                >
                                                    <span>{option.label}</span>
                                                    {isSelected && (
                                                        <Check aria-hidden="true" />
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                );
            }
            case "content":
                return (
                    <section className={styles.contentItem} key={item.id}>
                        <span className={styles.contentLabel}>{item.label}</span>
                        <p className={styles.contentValue}>{item.value}</p>
                    </section>
                );
            case "action": {
                const { button } = item;
                const confirmation = item.confirm;
                const isPending = button.loading;
                const isConfirmationOpen =
                    openConfirmations[item.id] ?? false;
                const confirmationID = `${titleId}-${item.id}-confirmation`;
                const className =
                    button.variant === "primary"
                        ? `${styles.action} ${styles.primaryAction}`
                        : `${styles.action} ${styles.secondaryAction}`;

                function handleActionClick() {
                    if (confirmation) {
                        setOpenConfirmations((current) =>
                            current[item.id] ? {} : { [item.id]: true },
                        );
                        return;
                    }

                    void button.onClick?.();
                }

                return (
                    <div className={styles.actionItem} key={item.id}>
                        <div className={styles.actionItemText}>
                            <span className={styles.actionItemLabel}>
                                {item.label}
                            </span>
                            {item.description && (
                                <p className={styles.actionItemDescription}>
                                    {item.description}
                                </p>
                            )}
                        </div>
                        <div
                            className={styles.actionButtonWrap}
                            ref={(node) => {
                                actionButtonWrapRefs.current[item.id] = node;
                            }}
                        >
                            <button
                                aria-controls={
                                    confirmation ? confirmationID : undefined
                                }
                                aria-expanded={
                                    confirmation
                                        ? isConfirmationOpen
                                        : undefined
                                }
                                className={className}
                                disabled={button.disabled || isPending}
                                onClick={handleActionClick}
                                type="button"
                            >
                                {button.icon}
                                {isPending && button.loadingLabel
                                    ? button.loadingLabel
                                    : button.label}
                            </button>
                            {confirmation && isConfirmationOpen && (
                                <ConfirmPrompt
                                    cancelLabel={confirmation.cancelLabel}
                                    confirmLabel={confirmation.confirmLabel}
                                    description={confirmation.description}
                                    id={confirmationID}
                                    isPending={isPending}
                                    onCancel={() =>
                                        setOpenConfirmations((current) => ({
                                            ...current,
                                            [item.id]: false,
                                        }))
                                    }
                                    onConfirm={() => button.onClick?.()}
                                    pendingLabel={confirmation.pendingLabel}
                                    title={confirmation.title}
                                />
                            )}
                        </div>
                    </div>
                );
            }
            case "checkbox":
                return (
                    <label
                        className={styles.option}
                        key={item.id}
                        title={item.title}
                    >
                        <span className={styles.checkboxControl}>
                            <input
                                checked={item.checked}
                                disabled={item.disabled}
                                readOnly
                                type="checkbox"
                            />
                            {item.checked && <Check aria-hidden="true" />}
                        </span>
                        <span>{item.label}</span>
                    </label>
                );
            case "disclosure": {
                const isExpanded = expandedItems[item.id] ?? false;
                const detailsId = `${titleId}-${item.id}`;
                return (
                    <div className={styles.disclosure} key={item.id}>
                        <button
                            aria-controls={detailsId}
                            aria-expanded={isExpanded}
                            className={styles.disclosureButton}
                            onClick={() =>
                                setExpandedItems((current) => ({
                                    ...current,
                                    [item.id]: !isExpanded,
                                }))
                            }
                            type="button"
                        >
                            <span>
                                {isExpanded
                                    ? item.expandedLabel
                                    : item.collapsedLabel}
                            </span>
                            <ChevronDown
                                className={
                                    isExpanded ? styles.isExpanded : undefined
                                }
                            />
                        </button>
                        {isExpanded && (
                            <div className={styles.disclosureDetails} id={detailsId}>
                                {item.fields?.map((field) => (
                                    <div className={styles.disclosureField} key={field.id}>
                                        <span>{field.label}</span>
                                        <strong>{field.value}</strong>
                                    </div>
                                ))}
                                {item.description && (
                                    <p>{item.description}</p>
                                )}
                            </div>
                        )}
                    </div>
                );
            }
        }
    }

    return (
        <div className={styles.layer} role="presentation">
            <button
                aria-label={closeLabel}
                className={styles.scrim}
                onClick={onClose}
                type="button"
            />
            <aside
                aria-labelledby={titleId}
                aria-modal="true"
                className={styles.drawer}
                role="dialog"
            >
                <header className={styles.header}>
                    <div className={styles.heading}>
                        {eyebrow && <p className={styles.eyebrow}>{eyebrow}</p>}
                        <h2 id={titleId}>{title}</h2>
                    </div>
                    <button
                        aria-label={closeLabel}
                        className={styles.close}
                        onClick={onClose}
                        type="button"
                    >
                        <X />
                    </button>
                </header>
                {sections && sections.length > 0 && (
                    <nav
                        aria-label={sectionsLabel}
                        className={styles.sectionTabs}
                        role="group"
                    >
                        {sections.map((section) => {
                            const isActive = activeSectionID === section.id;
                            return (
                                <button
                                    aria-pressed={isActive}
                                    className={
                                        isActive
                                            ? `${styles.sectionTab} ${styles.activeSectionTab}`
                                            : styles.sectionTab
                                    }
                                    key={section.id}
                                    onClick={() => {
                                        setOpenSelectID(null);
                                        onSectionChange?.(section.id);
                                    }}
                                    type="button"
                                >
                                    {section.label}
                                </button>
                            );
                        })}
                    </nav>
                )}
                <form className={styles.body} onSubmit={handleSubmit}>
                    {cards.map((card) => (
                        <section
                            className={[
                                styles.card,
                                card.layout === "grid" ? styles.gridCard : "",
                                card.size === "compact" ? styles.compactCard : "",
                            ]
                                .filter(Boolean)
                                .join(" ")}
                            key={card.id}
                        >
                            {card.items.map(renderItem)}
                        </section>
                    ))}
                    {submitError && (
                        <InlineAlert message={submitError} tone="error" />
                    )}
                    <footer className={styles.footer}>
                        {actions.map((action) => {
                            const isPending =
                                action.loading ||
                                (action.type === "submit" && isSubmitting);
                            const className =
                                action.variant === "primary"
                                    ? `${styles.action} ${styles.primaryAction}`
                                    : `${styles.action} ${styles.secondaryAction}`;

                            return (
                                <button
                                    className={className}
                                    disabled={action.disabled || isPending}
                                    key={action.id}
                                    onClick={action.onClick}
                                    type={action.type ?? "button"}
                                >
                                    {action.icon}
                                    {isPending && action.loadingLabel
                                        ? action.loadingLabel
                                        : action.label}
                                </button>
                            );
                        })}
                    </footer>
                </form>
            </aside>
        </div>
    );
}
