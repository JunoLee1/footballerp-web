"use client"

import * as React from "react"
import { Select as SelectPrimitive } from "@base-ui/react/select"

import { cn } from "@/lib/utils"
import { ChevronDownIcon, CheckIcon, ChevronUpIcon } from "lucide-react"

// SelectItem 이 등록한 label 을 SelectValue 가 조회할 수 있게 하는 context.
// base-ui Select.Value 는 items prop 또는 render children 없이는 selected value 를 그대로 렌더한다
// (raw enum code / id 노출). shadcn 사용처는 `<SelectValue placeholder="..." />` 만 쓰고
// `<SelectItem value=...>{label}</SelectItem>` 로 값을 넣는 패턴이므로, 이 context 로 items map 을 자동 구성한다.
interface SelectLabelStore {
  labels: Map<string, React.ReactNode>
  registerLabel: (value: string, label: React.ReactNode) => void
  unregisterLabel: (value: string) => void
}

const SelectLabelContext = React.createContext<SelectLabelStore | null>(null)

function useSelectLabelStore(): SelectLabelStore {
  const [, forceUpdate] = React.useReducer((x: number) => x + 1, 0)
  const labelsRef = React.useRef<Map<string, React.ReactNode>>(new Map())
  const registerLabel = React.useCallback((value: string, label: React.ReactNode) => {
    const prev = labelsRef.current.get(value)
    if (prev !== label) {
      labelsRef.current.set(value, label)
      forceUpdate()
    }
  }, [])
  const unregisterLabel = React.useCallback((value: string) => {
    if (labelsRef.current.delete(value)) {
      forceUpdate()
    }
  }, [])
  return React.useMemo(
    () => ({ labels: labelsRef.current, registerLabel, unregisterLabel }),
    [registerLabel, unregisterLabel],
  )
}

// base-ui 의 onValueChange 시그니처는 `(value, eventDetails) => void` 라서
// `useState` setter (`Dispatch<SetStateAction<T>>`) 를 그대로 넘기면 타입 불일치가 발생한다.
// 호출부가 거의 전부 setter 패턴이므로 wrapper 레벨에서 1-arg 콜백으로 노출.
type BaseSelectProps = Omit<React.ComponentProps<typeof SelectPrimitive.Root>, "onValueChange">
type SelectProps = BaseSelectProps & {
  onValueChange?: (value: any) => void
}

function Select({ onValueChange, ...props }: SelectProps) {
  const store = useSelectLabelStore()
  const handleValueChange = React.useCallback(
    (value: unknown) => {
      onValueChange?.(value)
    },
    [onValueChange],
  )
  return (
    <SelectLabelContext.Provider value={store}>
      <SelectPrimitive.Root
        {...(props as any)}
        onValueChange={onValueChange ? handleValueChange : undefined}
      />
    </SelectLabelContext.Provider>
  )
}

function SelectGroup({ className, ...props }: SelectPrimitive.Group.Props) {
  return (
    <SelectPrimitive.Group
      data-slot="select-group"
      className={cn("scroll-my-1 p-1", className)}
      {...props}
    />
  )
}

function SelectValue({
  className,
  placeholder,
  children,
  ...props
}: SelectPrimitive.Value.Props) {
  const store = React.useContext(SelectLabelContext)
  return (
    <SelectPrimitive.Value
      data-slot="select-value"
      className={cn("flex flex-1 text-left", className)}
      placeholder={placeholder}
      {...props}
    >
      {typeof children === "function"
        ? (children as (value: any) => React.ReactNode)
        : children != null
          ? children
          : // Default render: context 에 등록된 label 조회, 없으면 placeholder, 최후엔 raw value.
            (v: any) => {
              if (v == null || v === "") return placeholder ?? null
              const key = String(v)
              const label = store?.labels.get(key)
              if (label != null) return label
              return placeholder ?? key
            }}
    </SelectPrimitive.Value>
  )
}

function SelectTrigger({
  className,
  size = "default",
  children,
  ...props
}: SelectPrimitive.Trigger.Props & {
  size?: "sm" | "default"
}) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      data-size={size}
      className={cn(
        "flex w-fit items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent py-2 pr-2 pl-2.5 text-sm whitespace-nowrap transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-placeholder:text-muted-foreground data-[size=default]:h-8 data-[size=sm]:h-7 data-[size=sm]:rounded-[min(var(--radius-md),10px)] *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-1.5 dark:bg-input/30 dark:hover:bg-input/50 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon
        render={
          <ChevronDownIcon className="pointer-events-none size-4 text-muted-foreground" />
        }
      />
    </SelectPrimitive.Trigger>
  )
}

function SelectContent({
  className,
  children,
  side = "bottom",
  sideOffset = 4,
  align = "center",
  alignOffset = 0,
  alignItemWithTrigger = true,
  ...props
}: SelectPrimitive.Popup.Props &
  Pick<
    SelectPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset" | "alignItemWithTrigger"
  >) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        alignItemWithTrigger={alignItemWithTrigger}
        className="isolate z-50"
      >
        <SelectPrimitive.Popup
          data-slot="select-content"
          data-align-trigger={alignItemWithTrigger}
          className={cn("relative isolate z-50 max-h-(--available-height) w-(--anchor-width) min-w-36 origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-[align-trigger=true]:animate-none data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95", className )}
          {...props}
        >
          <SelectScrollUpButton />
          <SelectPrimitive.List>{children}</SelectPrimitive.List>
          <SelectScrollDownButton />
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  )
}

function SelectLabel({
  className,
  ...props
}: SelectPrimitive.GroupLabel.Props) {
  return (
    <SelectPrimitive.GroupLabel
      data-slot="select-label"
      className={cn("px-1.5 py-1 text-xs text-muted-foreground", className)}
      {...props}
    />
  )
}

function SelectItem({
  className,
  children,
  label,
  value,
  ...props
}: SelectPrimitive.Item.Props) {
  const resolvedLabel = label ?? (
    typeof children === "string" || typeof children === "number"
      ? String(children)
      : undefined
  )
  const store = React.useContext(SelectLabelContext)

  // Display label (SelectValue 렌더용) — string/number children 은 그대로, JSX children 은 whole node 사용.
  // label prop 이 명시되어 있으면 그것을 우선.
  const displayLabel: React.ReactNode = label ?? children

  React.useEffect(() => {
    if (store == null || value == null || value === "") return
    const key = String(value)
    store.registerLabel(key, displayLabel)
    return () => {
      store.unregisterLabel(key)
    }
  }, [store, value, displayLabel])

  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      value={value}
      label={resolvedLabel}
      className={cn(
        "relative flex w-full cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2",
        className
      )}
      {...props}
    >
      <SelectPrimitive.ItemText className="flex flex-1 shrink-0 gap-2 whitespace-nowrap">
        {children}
      </SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator
        render={
          <span className="pointer-events-none absolute right-2 flex size-4 items-center justify-center" />
        }
      >
        <CheckIcon className="pointer-events-none" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  )
}

function SelectSeparator({
  className,
  ...props
}: SelectPrimitive.Separator.Props) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn("pointer-events-none -mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  )
}

function SelectScrollUpButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollUpArrow>) {
  return (
    <SelectPrimitive.ScrollUpArrow
      data-slot="select-scroll-up-button"
      className={cn(
        "top-0 z-10 flex w-full cursor-default items-center justify-center bg-popover py-1 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      <ChevronUpIcon
      />
    </SelectPrimitive.ScrollUpArrow>
  )
}

function SelectScrollDownButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollDownArrow>) {
  return (
    <SelectPrimitive.ScrollDownArrow
      data-slot="select-scroll-down-button"
      className={cn(
        "bottom-0 z-10 flex w-full cursor-default items-center justify-center bg-popover py-1 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      <ChevronDownIcon
      />
    </SelectPrimitive.ScrollDownArrow>
  )
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
}
