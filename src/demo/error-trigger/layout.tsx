"use client";

export default function Layout({
    children,
    error_trigger,
}: {
    children: React.ReactNode;
    error_trigger: React.ReactNode;
}) {
    return (
        <>
            {error_trigger}
            {children}
        </>
    );
}