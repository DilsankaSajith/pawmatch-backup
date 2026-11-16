'use client';

import Image from 'next/image';
import { MapPin, Heart, Activity, Building2 } from 'lucide-react';
import { Pet } from '@/types';
import { Button } from './ui/button';
import Link from 'next/link';
import { useUser } from '@clerk/nextjs';

interface PetCardProps {
  pet: Pet;
}

const adoptionStatusStyles: Record<Pet['adoptionStatus'], string> = {
  Ready: 'bg-emerald-100 text-emerald-700',
  Pending: 'bg-amber-100 text-amber-700',
  Adopted: 'bg-slate-100 text-slate-500',
};

const healthConditionStyles: Record<Pet['healthCondition'], string> = {
  Healthy: 'text-emerald-600',
  Recovering: 'text-amber-600',
  Critical: 'text-red-500',
};

function PetCard({ pet }: PetCardProps) {
  const { name, breed, adoptionStatus, imageUrl, healthCondition, address } =
    pet;
  const { user } = useUser();

  const isOwnPet =
    user?.emailAddresses?.[0].emailAddress === pet.addedBy?.email;
  const isShelterPet = pet.addedBy?.role === 'Shelter_Admin';

  return (
    <div
      className={`group relative flex flex-col rounded-2xl shadow-md hover:shadow-xl transition-shadow duration-300 overflow-hidden max-w-xs w-full ${
        isOwnPet
          ? 'border border-brand-200 bg-white'
          : 'border border-slate-100 bg-white'
      }`}
    >
      {/* Brand gradient overlay for current user's pets */}
      {isOwnPet && (
        <div className="pointer-events-none absolute inset-0 z-10 rounded-2xl bg-gradient-to-t from-brand-100/50 via-brand-50/20 to-transparent" />
      )}

      {/* Shelter tag */}
      {isShelterPet && !isOwnPet && (
        <div className="absolute top-3 left-3 z-20 flex items-center gap-1 rounded-full bg-white/90 backdrop-blur-sm px-2.5 py-1 shadow-sm border border-slate-200">
          <Building2 className="h-3 w-3 text-slate-500" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-600">
            Shelter
          </span>
        </div>
      )}

      {/* Image */}
      <div className="relative h-52 w-full overflow-hidden bg-slate-100">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={`Photo of ${name}`}
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Heart className="h-12 w-12 text-slate-300" />
          </div>
        )}

        {/* Adoption status badge */}
        <span
          className={`absolute top-3 right-3 rounded-full px-2.5 py-0.5 text-xs font-semibold ${adoptionStatusStyles[adoptionStatus]}`}
        >
          {adoptionStatus}
        </span>
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col gap-3 p-4">
        {/* Name & Breed */}
        <div>
          <h3 className="text-lg font-bold text-slate-800 leading-tight">
            {name}
          </h3>
          <p className="text-sm text-slate-500">{breed}</p>
        </div>

        {/* Health Condition */}
        <div className="flex items-center gap-1.5">
          <Activity
            className={`h-4 w-4 shrink-0 ${healthConditionStyles[healthCondition]}`}
          />
          <span
            className={`text-sm font-medium ${healthConditionStyles[healthCondition]}`}
          >
            {healthCondition}
          </span>
        </div>

        {/* Address */}
        <div className="flex items-start gap-1.5">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
          <span className="text-sm text-slate-500 line-clamp-1">{address}</span>
        </div>

        {/* Adopt Button */}
        <Link href={`/pet/${pet.id}`}>
          <Button className="w-full">Adopt</Button>
        </Link>
      </div>
    </div>
  );
}

export default PetCard;
