"""
Serializers for authentication and user management in Blynkpages.
"""
from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from rest_framework import serializers
from rest_framework_simplejwt.tokens import RefreshToken


class UserSerializer(serializers.ModelSerializer):
    """Public profile serializer for authenticated users."""
    project_count = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'date_joined', 'project_count']
        read_only_fields = ['id', 'username', 'date_joined', 'project_count']

    def get_project_count(self, obj):
        return obj.projects.count() if hasattr(obj, 'projects') else 0


class RegisterSerializer(serializers.Serializer):
    """
    Secure registration serializer with multi-user concurrency protection
    and password strength verification.
    """
    email = serializers.EmailField(required=True)
    password = serializers.CharField(write_only=True, required=True, min_length=8)
    name = serializers.CharField(required=False, allow_blank=True, max_length=150)

    def validate_email(self, value):
        normalized = value.strip().lower()
        if User.objects.filter(email__iexact=normalized).exists():
            raise serializers.ValidationError("An account with this email already exists.")
        return normalized

    def validate_password(self, value):
        try:
            validate_password(value)
        except DjangoValidationError as e:
            raise serializers.ValidationError(list(e.messages))
        return value

    def create(self, validated_data):
        email = validated_data['email']
        password = validated_data['password']
        name = validated_data.get('name', '').strip()

        # Atomic transaction to prevent race conditions during high-volume concurrent signups
        with transaction.atomic():
            # Check again under transaction to guard against concurrent signup collision
            if User.objects.filter(email__iexact=email).exists():
                raise serializers.ValidationError({"email": "An account with this email already exists."})

            base_username = email.split('@')[0]
            username = base_username
            counter = 1
            while User.objects.filter(username=username).exists():
                username = f"{base_username}_{counter}"
                counter += 1

            user = User.objects.create_user(
                username=username,
                email=email,
                password=password,
                first_name=name
            )
            return user


class LoginSerializer(serializers.Serializer):
    """
    Login serializer supporting authentication by email or username.
    """
    email = serializers.CharField(required=True)
    password = serializers.CharField(write_only=True, required=True)

    def validate(self, attrs):
        login_input = attrs.get('email', '').strip()
        password = attrs.get('password', '')

        # Check if login_input is an email or username
        user = None
        if '@' in login_input:
            user_obj = User.objects.filter(email__iexact=login_input).first()
            if user_obj:
                user = authenticate(username=user_obj.username, password=password)
        else:
            user = authenticate(username=login_input, password=password)

        if not user:
            raise serializers.ValidationError("Invalid email or password.")

        if not user.is_active:
            raise serializers.ValidationError("This user account is inactive.")

        refresh = RefreshToken.for_user(user)

        return {
            'user': user,
            'access': str(refresh.access_token),
            'refresh': str(refresh),
        }
