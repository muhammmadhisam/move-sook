'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { VehiclePricingForm } from '@/components/settings/vehicle-pricing-form';

export default function NewVehiclePage() {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link
        href="/settings?tab=vehicles"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        กลับไปประเภทรถ
      </Link>
      <VehiclePricingForm />
    </div>
  );
}
