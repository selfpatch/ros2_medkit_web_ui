import * as React from 'react';
import { cn } from '@/lib/utils';
import type { VariantProps } from 'class-variance-authority';
import { cva } from 'class-variance-authority';

const buttonVariants = cva(
    'inline-flex items-center justify-center rounded-lg text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50',
    {
        variants: {
            variant: {
                // The one main action of a view: acid with graphite text
                default: 'bg-acid text-graphite hover:bg-acid-strong',
                destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive-strong',
                // A view's other actions: white on a hairline that darkens when pointed at
                outline:
                    'border border-graphite/12 bg-white text-foreground shadow-[0_1px_1px_rgb(18_20_19/0.04)] hover:border-graphite/30',
                secondary: 'bg-secondary text-secondary-foreground hover:bg-graphite/10',
                ghost: 'text-foreground hover:bg-graphite/6',
                link: 'text-link underline-offset-4 hover:underline',
            },
            size: {
                default: 'h-10 px-4 py-2',
                sm: 'h-9 px-3.5 text-[13px]',
                lg: 'h-11 px-8',
                icon: 'h-10 w-10',
            },
        },
        defaultVariants: {
            variant: 'default',
            size: 'default',
        },
    }
);

export interface ButtonProps
    extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
    asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, ...props }, ref) => {
    return <button className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
});
Button.displayName = 'Button';

// eslint-disable-next-line react-refresh/only-export-components
export { Button, buttonVariants };
