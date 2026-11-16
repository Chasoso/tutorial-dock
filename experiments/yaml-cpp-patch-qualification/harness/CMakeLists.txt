cmake_minimum_required(VERSION 3.20)
project(yaml_cpp_patch_qualification LANGUAGES CXX)

if(NOT MSVC)
    message(FATAL_ERROR "The Windows qualification must use MSVC.")
endif()
if(NOT CMAKE_VS_WINDOWS_TARGET_PLATFORM_VERSION)
    message(FATAL_ERROR "The Windows qualification must report its Windows SDK version.")
endif()

message(STATUS "QUALIFICATION_COMPILER=MSVC ${CMAKE_CXX_COMPILER_VERSION}")
message(STATUS "QUALIFICATION_WINDOWS_SDK=${CMAKE_VS_WINDOWS_TARGET_PLATFORM_VERSION}")

if(NOT DEFINED YAML_CPP_SOURCE_DIR OR NOT EXISTS "${YAML_CPP_SOURCE_DIR}/CMakeLists.txt")
    message(FATAL_ERROR "YAML_CPP_SOURCE_DIR must point to the checked-out yaml-cpp source.")
endif()

option(QUALIFY_PATCHED "Expect the quoted-scalar newline patch to be applied" OFF)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_MSVC_RUNTIME_LIBRARY "MultiThreaded" CACHE STRING "Use the static MSVC runtime" FORCE)

set(YAML_BUILD_SHARED_LIBS OFF CACHE BOOL "Build yaml-cpp statically" FORCE)
set(YAML_CPP_BUILD_TESTS OFF CACHE BOOL "Do not build upstream test dependencies" FORCE)
set(YAML_CPP_BUILD_TOOLS OFF CACHE BOOL "Do not build yaml-cpp tools" FORCE)
set(YAML_CPP_BUILD_CONTRIB OFF CACHE BOOL "Do not build yaml-cpp contrib" FORCE)
set(YAML_CPP_INSTALL OFF CACHE BOOL "Do not install yaml-cpp" FORCE)
set(YAML_MSVC_SHARED_RT OFF CACHE BOOL "Use /MT for yaml-cpp" FORCE)

add_subdirectory("${YAML_CPP_SOURCE_DIR}" "${CMAKE_BINARY_DIR}/yaml-cpp")

add_executable(yaml_cpp_qualification_tests
    compatibility_tests.cpp
    resource_bounds_tests.cpp)
target_link_libraries(yaml_cpp_qualification_tests PRIVATE yaml-cpp::yaml-cpp)
target_compile_features(yaml_cpp_qualification_tests PRIVATE cxx_std_17)
if(MSVC)
    target_compile_options(yaml_cpp_qualification_tests PRIVATE /utf-8 /W4)
    target_compile_definitions(yaml_cpp_qualification_tests PRIVATE _CRT_SECURE_NO_WARNINGS)
endif()
if(QUALIFY_PATCHED)
    target_compile_definitions(yaml_cpp_qualification_tests PRIVATE QUALIFY_PATCHED=1)
endif()

enable_testing()
add_test(NAME yaml_cpp_qualification_tests COMMAND yaml_cpp_qualification_tests)
